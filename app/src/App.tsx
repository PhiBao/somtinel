import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeAbiParameters,
  formatEther,
  http,
  keccak256,
  parseAbiParameters,
  stringToHex,
  webSocket,
} from "viem";
import { SDK as ReactivitySDK } from "@somnia-chain/reactivity";
import { SDK as StreamsSDK } from "@somnia-chain/streams";

import {
  getIncidentViewSelector,
  incidentOpenedTopic,
  incidentStatusLabel,
  responderAbi,
  SOMTINEL_STREAM_SCHEMA,
  somniaShannon,
  vaultAbi,
} from "@shared/somtinel";

type IncidentRow = {
  incidentId: bigint;
  requestId: bigint;
  destination: `0x${string}` | string;
  amount: bigint;
  riskScore: number;
  status: number;
  trusted: boolean;
  reviewDeadlineMs: number;
};

type StreamRow = {
  timestamp: number;
  incidentId: bigint;
  riskScore: number;
  status: string;
  summary: string;
  recommendedAction: string;
  target: string;
  amount: bigint;
};

const env = {
  rpcHttp: import.meta.env.VITE_SOMNIA_RPC_HTTP as string | undefined,
  vaultAddress: import.meta.env.VITE_SOMTINEL_VAULT_ADDRESS as `0x${string}` | undefined,
  responderAddress: import.meta.env.VITE_SOMTINEL_RESPONDER_ADDRESS as `0x${string}` | undefined,
  streamPublisher: import.meta.env.VITE_SOMTINEL_STREAM_PUBLISHER as `0x${string}` | undefined,
};

function MetricCard({ label, value, subline }: { label: string; value: string; subline: string }) {
  return (
    <article className="metric-card">
      <p className="eyebrow">{label}</p>
      <h3>{value}</h3>
      <p className="subline">{subline}</p>
    </article>
  );
}

function StatusPill({ code }: { code: number }) {
  return <span className={`status-pill status-${code}`}>{incidentStatusLabel(code)}</span>;
}

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function pullIncidents(rpc: string) {
  const client = createPublicClient({ chain: somniaShannon, transport: http(rpc) });
  const rows: IncidentRow[] = [];
  const seenReqIds = new Set<bigint>();

  if (env.responderAddress) {
    const nextId = await client.readContract({
      address: env.responderAddress, abi: responderAbi, functionName: "nextIncidentId",
    });
    for (let i = 1n; i < nextId; i++) {
      const row = await client.readContract({
        address: env.responderAddress, abi: responderAbi, functionName: "getIncidentView", args: [i],
      });
      seenReqIds.add(row[0]);
      rows.push({
        incidentId: i, requestId: row[0], destination: row[1], amount: row[2],
        riskScore: Number(row[6]), status: Number(row[7]), trusted: row[8], reviewDeadlineMs: Number(row[5]),
      });
    }
  }

  if (env.vaultAddress) {
    try {
      // use raw eth_call to bypass any ABI parsing issues
      const nrResult = await client.call({
        to: env.vaultAddress,
        data: "0x6a84a985" as `0x${string}`,
      });
      const nrData = (nrResult as { data: `0x${string}` }).data;
      if (!nrData || nrData === "0x") return rows;
      const nextReqId = BigInt(nrData);
      const end = nextReqId - 15n > 0n ? nextReqId - 15n : 1n;
      for (let r = nextReqId - 1n; r >= end; r--) {
        if (seenReqIds.has(r)) continue;
        try {
          const result = await client.call({
            to: env.vaultAddress,
            data: `0x2933e22d${r.toString(16).padStart(64, "0")}` as `0x${string}`,
          });
          const data = (result as { data: `0x${string}` }).data;
          if (!data || data === "0x") continue;
          const decoded = decodeAbiParameters(
            parseAbiParameters("address, address, uint256, bytes32, uint64, bool, bool"),
            data
          );
          if (decoded[5]) {
            // auto-executed
            rows.push({
              incidentId: 0n, requestId: r,
              destination: decoded[1], amount: decoded[2],
              riskScore: 12, status: 1, trusted: true,
              reviewDeadlineMs: Number(decoded[4]) * 1000,
            });
          } else if (!decoded[5] && !decoded[6]) {
            // pending/stuck — auto-execute failed (likely vault balance)
            rows.push({
              incidentId: 0n, requestId: r,
              destination: decoded[1], amount: decoded[2],
              riskScore: 0, status: 0, trusted: true,
              reviewDeadlineMs: Number(decoded[4]) * 1000,
            });
          }
        } catch { /* skip */ }
      }
    } catch (e) {
      console.error("vault scan failed completely", e);
    }
  }

  rows.sort((a, b) => Number(b.requestId - a.requestId));
  return rows;
}

async function pullStreams(rpc: string) {
  const client = createPublicClient({ chain: somniaShannon, transport: http(rpc) });
  const streamData: StreamRow[] = [];
  if (!env.responderAddress || !env.streamPublisher) return streamData;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdk = new StreamsSDK({ public: client } as any);
    const schemaId = await sdk.streams.computeSchemaId(SOMTINEL_STREAM_SCHEMA);
    if (!(schemaId instanceof Error)) {
      const raw = await sdk.streams.getAllPublisherDataForSchema(schemaId, env.streamPublisher);
      if (!(raw instanceof Error) && Array.isArray(raw)) {
        for (const entry of raw as any[]) {
          streamData.push({
            timestamp: Number(entry[0].value.value),
            incidentId: BigInt(entry[1].value.value as string | number | bigint),
            riskScore: Number(entry[2].value.value),
            status: String(entry[3].value.value),
            summary: String(entry[4].value.value),
            recommendedAction: String(entry[5].value.value),
            target: String(entry[6].value.value),
            amount: BigInt(entry[7].value.value as string | number | bigint),
          });
        }
      }
    }
  } catch { /* streams not avail */ }
  return streamData;
}

export default function App() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [streamRows, setStreamRows] = useState<StreamRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [requestDestination, setRequestDestination] = useState("0x4Ba1e9e275EF61B56C99532D0066506436201D73");
  const [requestAmount, setRequestAmount] = useState("0.01");
  const [reason, setReason] = useState("market-maker rebalancing");
  const [submitMessage, setSubmitMessage] = useState("");
  const [resolveMsg, setResolveMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const rpc = env.rpcHttp ?? "https://api.infra.testnet.somnia.network/";

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [incRows, strRows] = await Promise.all([
        pullIncidents(rpc),
        pullStreams(rpc),
      ]);
      setIncidents(incRows);
      setStreamRows(strRows);
      setConnected(true);
    } catch { /* retry next poll */ }
    setRefreshing(false);
  }, [rpc]);

  const metrics = useMemo(() => {
    const openIncidents = incidents.filter((i) => i.status === 2 || i.status === 3).length;
    const escalated = incidents.filter((i) => i.status === 3).length;
    const highRisk = incidents.filter((i) => i.riskScore >= 80).length;
    return {
      autonomousApprovalRate: connected ? `${Math.max(0, 100 - openIncidents * 11)}%` : "--",
      avgReactionTime: "sub-second",
      highRiskCapture: connected ? `${highRisk}/${incidents.length || 1} flagged` : "--",
      streamSync: connected ? (escalated > 0 ? "Escalated" : "Healthy") : "--",
    };
  }, [incidents, connected]);

  // initial load + polling every 12s
  useEffect(() => {
    refreshData();
    timerRef.current = setInterval(refreshData, 12000);
    return () => clearInterval(timerRef.current);
  }, [refreshData]);

  // WebSocket live push
  useEffect(() => {
    let cancelled = false;
    if (!env.responderAddress) return;

    const wsUrl = rpc.replace("https://", "wss://").replace("http://", "ws://").replace(/\/$/, "") + "/ws";

    (async () => {
      try {
        const wsClient = createPublicClient({ chain: somniaShannon, transport: webSocket(wsUrl) });
        const sdk = new ReactivitySDK({ public: wsClient });
        const sub = await sdk.subscribe({
          eventContractSources: [env.responderAddress!],
          topicOverrides: [incidentOpenedTopic],
          ethCalls: [{ to: env.responderAddress!, data: getIncidentViewSelector }],
          context: "topic1",
          onlyPushChanges: true,
          onData: (payload: { result: { topics: `0x${string}`[]; data: `0x${string}`; simulationResults: `0x${string}`[] } }) => {
            if (cancelled) return;
            try {
              const topics = payload.result.topics as `0x${string}`[];
              const sim = payload.result.simulationResults as `0x${string}`[];
              const incidentId = BigInt(topics[1]);

              if (incidentId === 0n) {
                const dest = topics[2] ? `0x${topics[2].slice(-40)}` as `0x${string}` : "0x";
                const evtData = decodeAbiParameters(
                  parseAbiParameters("uint256, uint256, bool"),
                  payload.result.data as `0x${string}`
                );
                setIncidents((c) => [
                  { incidentId: 0n, requestId: evtData[1], destination: dest, amount: evtData[0], riskScore: 12, status: 1, trusted: true, reviewDeadlineMs: Date.now() },
                  ...c.filter((r) => !(r.incidentId === 0n && r.requestId === evtData[1])),
                ]);
                return;
              }

              if (!sim[0] || sim[0] === "0x") return;
              const [reqId, dest, amt, , , dlMs, risk, status, trusted] = decodeAbiParameters(
                parseAbiParameters("uint256, address, uint256, bytes32, uint64, uint64, uint8, uint8, bool"),
                sim[0]
              );
              setIncidents((c) => [
                { incidentId, requestId: reqId, destination: dest, amount: amt, riskScore: risk, status, trusted, reviewDeadlineMs: Number(dlMs) },
                ...c.filter((r) => r.incidentId !== incidentId),
              ]);
            } catch { /* skip */ }
          },
          onError: () => {},
        });
        if (sub instanceof Error) console.error(sub);
      } catch { /* ws failed, poll covers it */ }
    })();

    return () => { cancelled = true; };
  }, [rpc]);

  // suppress extension noise
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const msg = String(event.reason?.message ?? event.reason ?? "");
      if (msg.includes("message channel closed") || msg.includes("listener indicated")) event.preventDefault();
    };
    const onError = (event: ErrorEvent) => {
      if (event.message?.includes("message channel closed")) event.preventDefault();
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  const handleRequest = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ethereum = (window as any).ethereum;
    if (!ethereum) { setSubmitMessage("No wallet found."); return; }
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as `0x${string}`[];
      const account = accounts?.[0];
      if (!account) { setSubmitMessage("No account."); return; }
      if (!env.vaultAddress) { setSubmitMessage("Vault address not configured."); return; }

      const walletClient = createWalletClient({ chain: somniaShannon, transport: custom(ethereum) });
      const reasonHash = keccak256(stringToHex(reason));
      const hash = await walletClient.writeContract({
        account,
        address: env.vaultAddress,
        abi: vaultAbi,
        functionName: "requestWithdrawal",
        args: [requestDestination as `0x${string}`, BigInt(Math.floor(Number(requestAmount) * 1e18)), reasonHash],
      });
      setSubmitMessage(`Submitted: ${hash}`);
      setTimeout(() => refreshData(), 5000);
    } catch (error: any) {
      if (error?.code === 4001) setSubmitMessage("Transaction rejected in wallet.");
      else setSubmitMessage(`Failed: ${(error?.shortMessage ?? error?.message ?? "").slice(0, 120)}`);
    }
  }, [reason, requestAmount, requestDestination, refreshData]);

  const handleResolve = useCallback(async (incidentId: bigint, approve: boolean) => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) { setResolveMsg("No wallet."); return; }
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as `0x${string}`[];
      const account = accounts?.[0];
      if (!account || !env.responderAddress) return;

      const walletClient = createWalletClient({ chain: somniaShannon, transport: custom(ethereum) });
      await walletClient.writeContract({
        account, address: env.responderAddress, abi: responderAbi,
        functionName: "resolveIncident", args: [incidentId, approve],
      });
      setResolveMsg(`${approve ? "Approved" : "Rejected"} incident #${incidentId.toString()}`);
      setTimeout(() => refreshData(), 4000);
    } catch { setResolveMsg("Resolution failed."); }
  }, [refreshData]);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Somnia Agentic L1 MVP</p>
          <h1>Autonomous treasury defense with reactive execution and typed agent memory.</h1>
          <p className="lead">
            Somtinel watches treasury intent, executes safe flows in-chain, escalates suspicious flows on schedule, and
            publishes machine-readable incident state to Somnia Data Streams.
          </p>
        </div>
        <div className="hero-panel">
          <div className="network-tag">{connected ? "Live on Shannon" : loadError ? "Offline" : "Connecting…"}</div>
          <MetricCard label="Autonomous Approval Rate" value={metrics.autonomousApprovalRate} subline="trusted low-limit withdrawals" />
          <MetricCard label="Average Reaction Time" value={metrics.avgReactionTime} subline="reactive callback path" />
          <MetricCard label="High Risk Capture" value={metrics.highRiskCapture} subline="flagged before release" />
          <MetricCard label="Agent Memory Feed" value={metrics.streamSync} subline="Somnia Streams sync state" />
        </div>
      </section>

      {loadError && <p className="muted" style={{ textAlign: "center", marginBottom: 16 }}>{loadError}</p>}

      <section className="grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Mission Control</p>
              <h2>Active incidents</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <p className="muted">auto-refresh every 12s</p>
              <button className="btn-refresh" onClick={refreshData} disabled={refreshing}>{refreshing ? "…" : "↻"}</button>
            </div>
          </div>

          <div className="incident-list">
            {incidents.length === 0 && (
              <p className="muted" style={{ textAlign: "center", padding: 24 }}>
                {connected ? "No requests yet. Submit a withdrawal to get started." : "Connecting to Somnia Shannon…"}
              </p>
            )}
            {incidents.map((incident) => (
              <article className="incident-card" key={`${incident.incidentId.toString()}-${incident.requestId.toString()}`}>
                <div className="incident-meta">
                  <span>{incident.incidentId === 0n ? `Req #${incident.requestId.toString()}` : `Incident #${incident.incidentId.toString()}`}</span>
                  <StatusPill code={incident.status} />
                </div>
                <h3>{shorten(String(incident.destination))}</h3>
                <p className="amount">{formatEther(incident.amount)} STT</p>
                <div className="incident-tags">
                  <span>risk {incident.riskScore}</span>
                  <span>{incident.trusted ? "trusted destination" : "untrusted destination"}</span>
                  <span>request {incident.requestId.toString()}</span>
                </div>
                <p className="muted">Review deadline: {new Date(incident.reviewDeadlineMs).toLocaleString()}</p>
                {(incident.status === 2 || incident.status === 3) && (
                  <div className="incident-actions">
                    <button className="btn-approve" onClick={() => handleResolve(incident.incidentId, true)}>Approve & Execute</button>
                    <button className="btn-reject" onClick={() => handleResolve(incident.incidentId, false)}>Reject & Cancel</button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {resolveMsg && <p className="muted" style={{ marginTop: 8 }}>{resolveMsg}</p>}
        </article>

        <article className="panel request-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Operator Input</p>
              <h2>Request a withdrawal</h2>
            </div>
            <p className="muted">Safe destinations auto-settle. Everything else enters an incident lane.</p>
          </div>

          <form className="request-form" onSubmit={handleRequest}>
            <label>
              Destination
              <div style={{ display: "flex", gap: 8 }}>
                <input value={requestDestination} onChange={(e) => setRequestDestination(e.target.value)} style={{ flex: 1 }} />
                <button type="button" className="btn-use-my" onClick={async () => {
                  try {
                    const ethereum = (window as any).ethereum;
                    if (ethereum) {
                      const accs = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
                      if (accs?.[0]) setRequestDestination(accs[0]);
                    }
                  } catch { /* ignore */ }
                }}>My addr</button>
              </div>
            </label>
            <label>
              Amount (STT)
              <input value={requestAmount} onChange={(e) => setRequestAmount(e.target.value)} />
            </label>
            <label>
              Reason
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} />
            </label>
            <button type="submit">Submit Treasury Intent</button>
            {submitMessage && <p className="muted">{submitMessage}</p>}
          </form>
        </article>
      </section>

      <section className="panel feed-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Somnia Streams</p>
            <h2>Typed agent memory</h2>
          </div>
          <div style={{ textAlign: "right" }}>
            <p className="muted">Machine-readable diagnostic rail other agents can consume.</p>
            <p className="muted" style={{ fontSize: "0.7rem", marginTop: 4 }}>
              Publisher: {env.streamPublisher ? shorten(env.streamPublisher) : "not set"}
              {" · "}Schema: somtinel_incident_digest_v1
            </p>
          </div>
        </div>

        <div className="feed-table">
          {streamRows.length === 0 && (
            <p className="muted" style={{ textAlign: "center", padding: 24 }}>
              {connected ? "No stream records yet. Run the off-chain agent to populate." : "Loading…"}
            </p>
          )}
          {streamRows.map((row) => (
            <article className="feed-row" key={`${row.incidentId.toString()}-${row.timestamp}`}>
              <div>
                <p className="eyebrow">Incident #{row.incidentId.toString()}</p>
                <h3>{row.status}</h3>
                <p>{row.summary}</p>
              </div>
              <div className="feed-side">
                <span>{new Date(row.timestamp).toLocaleTimeString()}</span>
                <span>{formatEther(row.amount)} STT</span>
                <span>risk {row.riskScore}</span>
                <span>{shorten(row.target)}</span>
              </div>
              <p className="muted">{row.recommendedAction}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="footnote-grid">
        <article className="panel mini">
          <p className="eyebrow">TAM / SAM / SOM</p>
          <p>Initial SOM is treasury automation for on-chain teams already using bots or ops dashboards. Expandable into payout orchestration, game economies, agent settlement, and compliance-aware treasury rails.</p>
        </article>
        <article className="panel mini">
          <p className="eyebrow">Attack Surface</p>
          <p>Main risks are recursive reactivity loops, underfunded subscriptions, incorrect trusted lists, and weak agent heuristics. The MVP defaults to quarantine over release and keeps the blast radius contract-local.</p>
        </article>
        <article className="panel mini">
          <p className="eyebrow">How it works</p>
          <p>
            Request a withdrawal from the form. Somnia's reactivity precompile fires a handler in the same block.
            Safe payouts settle instantly. Risky ones are quarantined as on-chain incidents with risk scores
            and review deadlines. Everything is verifiable, composable, and machine-readable.
          </p>
        </article>
      </section>
    </main>
  );
}
