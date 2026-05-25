# AGENTS.md

This repo is a Somnia hackathon MVP called **Somtinel**. It demonstrates an agent-driven treasury risk responder using Somnia Reactivity and Somnia Data Streams.

## Product Brief

Problem:

- Crypto treasury operations are too manual for machine-speed environments.
- Existing automation is often off-chain, opaque, and difficult for other agents to inspect.
- Teams need a path where safe actions execute autonomously while suspicious actions are quarantined and escalated.

Target users:

- DAO treasury operators
- protocol foundations and ecosystem funds
- game economy operators
- market makers and on-chain ops teams

Core behavior:

- Treasury operator calls `TreasuryVault.requestWithdrawal()`.
- Somnia on-chain Reactivity watches the `WithdrawalRequested` event.
- `SomtinelResponder` auto-executes trusted low-value withdrawals.
- Risky withdrawals become on-chain incidents.
- An off-chain agent watches incidents via WebSocket, reads incident state atomically, and publishes typed diagnostics to Somnia Data Streams.
- The React dashboard surfaces incidents, request submission, resolve actions, and the agent memory feed.

## Somnia Testnet Constants

- Chain ID: `50312`
- HTTP RPC: `https://api.infra.testnet.somnia.network/`
- WebSocket RPC: `wss://api.infra.testnet.somnia.network/ws`
- Explorer: `https://shannon-explorer.somnia.network/`
- Reactivity precompile: `0x0100`
- Subscription owner minimum balance: `32 STT`
- System events: `BlockTick(uint64)`, `Schedule(uint256)`

## Repo Structure

- `src/TreasuryVault.sol` — minimal treasury vault and withdrawal request state
- `src/SomtinelResponder.sol` — Somnia reactive handler for auto-execution and incident escalation
- `src/interfaces/ITreasuryVault.sol` — responder-facing vault interface
- `vendor/@somnia-chain/reactivity-contracts` — vendored Somnia reactivity contract interfaces
- `test/SomtinelResponder.t.sol` — 6 Foundry tests (auto-execute, incident, escalation, resolve)
- `scripts/agent.ts` — off-chain agent: WebSocket watch + Streams publish
- `scripts/configureSomtinel.ts` — on-chain setup: trusted dest, responder, subscription
- `scripts/generateDeck.ts` — PPTX slide deck generator
- `shared/somtinel.ts` — shared constants, ABIs, schema, chain config
- `app/src/App.tsx` — Vite/React dashboard (live mode, no demo fallback)
- `app/src/styles.css` — cyberpunk terminal UI
- `app/src/polyfills.ts` — Buffer polyfill for Somnia SDKs in browser
- `submission.md` — hackathon submission writeup
- `DEMO_SCRIPT.md` — 110-second demo script with UI cues

## Commands

```bash
npm install                    # dependencies
npm run dev                    # Vite dev server at :5173
npm run build                  # tsc + vite build
npm run agent                  # off-chain agent
npm run configure              # on-chain setup script
npm run check                  # build + forge test
npm run deck                   # generate somtinel-deck.pptx
forge test                     # 6/6 Solidity tests
```

## Environment

Copy `.env.example` → `app/.env` for the frontend and `.env` for scripts:

```bash
# scripts (agent, configure)
PRIVATE_KEY=0x...
SOMNIA_RPC_HTTP=https://api.infra.testnet.somnia.network/
SOMNIA_RPC_WS=wss://api.infra.testnet.somnia.network/ws
SOMTINEL_VAULT_ADDRESS=0x...
SOMTINEL_RESPONDER_ADDRESS=0x...
SAFE_DESTINATION=0x...

# frontend (app/.env)
VITE_SOMTINEL_VAULT_ADDRESS=0x...
VITE_SOMTINEL_RESPONDER_ADDRESS=0x...
VITE_SOMTINEL_STREAM_PUBLISHER=0x...
```

## Deployed Contracts (Somnia Shannon Testnet)

| Contract | Address |
|---|---|
| TreasuryVault | `0xef673bdac2c86506874919b1ad05bd7d7fa64344` |
| SomtinelResponder | `0x43D8395140595eEfC185549840afF90b73128e1a` |
| Reactive Subscription | ID `2335572` (3M gas) |

## Deployment Architecture

```
┌─────────────────────────────────────────────────┐
│ Vercel (static)                                 │
│  React dashboard → reads chain + Streams        │
└─────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────┐
│ Render / Railway (persistent)                   │
│  agent.ts → WebSocket watch → Streams publish   │
└─────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────┐
│ Somnia Shannon Testnet                          │
│  TreasuryVault ← SomtinelResponder (0x0100)     │
│  Data Streams (typed agent memory)              │
└─────────────────────────────────────────────────┘
```

Vercel cannot run the agent because it's a long-lived WebSocket process (serverless functions time out). The agent must run on a persistent service: Render, Railway, Fly.io, or a VPS. The frontend is a static Vite build — deployable anywhere.

## Security

- Handler only accepts calls from `0x0100` (reactivity precompile)
- No self-triggering event loops — handler events don't match its own subscriptions
- Default to quarantine over release — suspicious flows never auto-execute
- `maxFeePerGas = 0` delegates fee choice to protocol limits
- Deterministic risk scoring — no external oracle dependency
- `withdrawStuckEth()` allows owner to recover STT from contract

## Known Limitations

- Risk scoring is intentionally simple and deterministic (4 tiers)
- Vault is an MVP treasury, not production custody
- Dashboard write path requires a browser wallet (MetaMask)
- Somnia L2 gas: contract deployment needs ~25M gas, handler needs 3M gas for incident SSTORE
- Escalation scheduling (`_scheduleEscalation`) disabled in handler due to gas budget — incidents stay in NeedsReview until owner resolves manually

## Current State

| Check | Status |
|---|---|
| forge test | 6/6 |
| tsc --noEmit | clean |
| vite build | passes |
| npm run check | all green |
| On-chain auto-execute | verified |
| On-chain incident creation | verified |
| On-chain resolve (approve/reject) | verified |
| Off-chain agent | WebSocket watching, Streams publishing |
| Frontend live mode | connected to Shannon |
