import "dotenv/config";

import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  http,
  parseAbiParameters,
  toHex,
  webSocket,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SDK as ReactivitySDK } from "@somnia-chain/reactivity";
import { SDK as StreamsSDK, SchemaEncoder, zeroBytes32 } from "@somnia-chain/streams";

import {
  getIncidentViewSelector,
  incidentOpenedTopic,
  incidentStatusLabel,
  responderAbi,
  SOMTINEL_STREAM_SCHEMA,
  SOMTINEL_STREAM_SCHEMA_NAME,
  somniaShannon,
} from "../shared/somtinel";

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const responderAddress = process.env.SOMTINEL_RESPONDER_ADDRESS as `0x${string}` | undefined;
const rpcHttp = process.env.SOMNIA_RPC_HTTP ?? "https://api.infra.testnet.somnia.network/";
const rpcWs = process.env.SOMNIA_RPC_WS ?? "wss://api.infra.testnet.somnia.network/ws";

if (!privateKey || !responderAddress) {
  throw new Error("Set PRIVATE_KEY and SOMTINEL_RESPONDER_ADDRESS before running the agent.");
}

const account = privateKeyToAccount(privateKey);

console.log(`[agent] using wallet ${account.address}`);
console.log(`[agent] watching responder ${responderAddress}`);

const publicHttpClient = createPublicClient({
  chain: somniaShannon,
  transport: http(rpcHttp),
});

const publicWsClient = createPublicClient({
  chain: somniaShannon,
  transport: webSocket(rpcWs),
});

const walletClient = createWalletClient({
  account,
  chain: somniaShannon,
  transport: http(rpcHttp),
});

const reactivitySdk = new ReactivitySDK({
  public: publicWsClient,
  wallet: walletClient,
});

const streamsSdk = new StreamsSDK({
  public: publicHttpClient,
  wallet: walletClient,
} as any);

const encoder = new SchemaEncoder(SOMTINEL_STREAM_SCHEMA);

async function ensureSchemaRegistered() {
  const schemaIdResult = await streamsSdk.streams.computeSchemaId(SOMTINEL_STREAM_SCHEMA);
  if (schemaIdResult instanceof Error) {
    throw schemaIdResult;
  }

  const exists = await streamsSdk.streams.isDataSchemaRegistered(schemaIdResult);
  if (exists instanceof Error) {
    throw exists;
  }

  if (!exists) {
    const txHash = await streamsSdk.streams.registerDataSchemas(
      [{ schemaName: SOMTINEL_STREAM_SCHEMA_NAME, schema: SOMTINEL_STREAM_SCHEMA, parentSchemaId: zeroBytes32 as `0x${string}` }],
      true
    );

    if (txHash instanceof Error) {
      throw txHash;
    }

    await publicHttpClient.waitForTransactionReceipt({ hash: txHash });
  }

  return schemaIdResult;
}

function makeSummary(riskScore: number, trusted: boolean, amount: bigint) {
  if (riskScore >= 80) {
    return `High risk withdrawal for ${amount} wei to ${trusted ? "trusted" : "unknown"} destination`;
  }

  if (riskScore >= 50) {
    return `Elevated risk withdrawal exceeds trusted low-limit lane`;
  }

  return "Low risk withdrawal";
}

function recommendedAction(riskScore: number, trusted: boolean) {
  if (riskScore >= 80) return "Reject or manually verify destination ownership";
  if (riskScore >= 50 && trusted) return "Approve only if business context matches expected payout";
  if (riskScore >= 50) return "Wait for ops confirmation";
  return "Auto execution acceptable";
}

async function publishDigest(schemaId: `0x${string}`, incidentId: bigint, state: {
  target: `0x${string}`;
  amount: bigint;
  reviewDeadlineMs: bigint;
  riskScore: number;
  status: number;
  trusted: boolean;
}) {
  const statusText = incidentStatusLabel(state.status);
  const summary = makeSummary(state.riskScore, state.trusted, state.amount);
  const action = recommendedAction(state.riskScore, state.trusted);

  const encoded = encoder.encodeData([
    { name: "timestamp", type: "uint64", value: BigInt(Date.now()) },
    { name: "incidentId", type: "uint256", value: incidentId },
    { name: "riskScore", type: "uint8", value: state.riskScore },
    { name: "status", type: "string", value: statusText },
    { name: "summary", type: "string", value: summary },
    { name: "recommendedAction", type: "string", value: action },
    { name: "target", type: "address", value: state.target },
    { name: "amount", type: "uint256", value: state.amount },
  ]);

  const dataId = toHex(`incident-${incidentId.toString()}`, { size: 32 });
  const txHash = await streamsSdk.streams.set([
    {
      id: dataId,
      schemaId,
      data: encoded,
    },
  ]);

  if (txHash instanceof Error) {
    throw txHash;
  }

  await publicHttpClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[agent] published digest for incident ${incidentId.toString()} -> ${txHash}`);
}

async function main() {
  const schemaId = await ensureSchemaRegistered();

  const subscription = await reactivitySdk.subscribe({
    eventContractSources: [responderAddress!],
    topicOverrides: [incidentOpenedTopic],
    ethCalls: [
      {
        to: responderAddress!,
        data: getIncidentViewSelector,
      },
    ],
    context: "topic1",
    onlyPushChanges: true,
    onData: async (payload: { result: { topics: `0x${string}`[]; data: `0x${string}`; simulationResults: `0x${string}`[] } }) => {
      try {
        const topics = payload.result.topics as `0x${string}`[];
        const sim = payload.result.simulationResults as `0x${string}`[];
        const incidentId = BigInt(topics[1]);

        if (incidentId === 0n) {
          console.log("[agent] auto-executed withdrawal detected (incident 0)");
          return;
        }

        if (!sim[0] || sim[0] === "0x") {
          console.log("[agent] missing simulation result for incident", incidentId.toString());
          return;
        }

        const [requestId, destination, amount, , , reviewDeadlineMs, riskScore, status, trusted] =
          decodeAbiParameters(
            parseAbiParameters("uint256, address, uint256, bytes32, uint64, uint64, uint8, uint8, bool"),
            sim[0]
          );

        console.log(
          `[agent] incident ${incidentId.toString()} request=${requestId.toString()} risk=${riskScore} status=${status} trusted=${trusted}`
        );

        await publishDigest(schemaId, incidentId, {
          target: destination,
          amount,
          reviewDeadlineMs,
          riskScore,
          status,
          trusted,
        });
      } catch (error) {
        console.error("[agent] failed to process incident event", error);
      }
    },
    onError: (error: unknown) => {
      console.error("[agent] subscription error", error);
    },
  });

  if (subscription instanceof Error) {
    throw subscription;
  }

  console.log(`[agent] watching ${responderAddress} on ${rpcWs}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
