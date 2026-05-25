# Somtinel

Somtinel is an agent-driven treasury risk responder built for Somnia's Agentic L1 hackathon. It combines:

- on-chain Reactivity for same-block autonomous actions
- system-event scheduling for delayed escalations
- Somnia Data Streams for typed agent memory
- an operator dashboard for withdrawals, incidents, and stream digests

## Problem

Crypto treasuries still live in a bad middle ground:

- low-friction multisig flows are too manual to react at machine speed
- full automation is often brittle, opaque, or off-chain only
- risk engines rarely leave verifiable, structured state that other agents can consume

Somtinel turns a treasury withdrawal into an agent-native flow. Small, trusted withdrawals settle autonomously. Risky ones open incidents on-chain, get escalated on a schedule, and are enriched by an off-chain agent that publishes typed diagnostics back to Somnia.

## Why Somnia

Somnia is unusually well-suited for this pattern because its docs expose two primitives that most EVM chains still approximate with off-chain glue:

1. On-chain Reactivity
   Reactive handlers subscribe through the `0x0100` precompile and run as synthetic transactions in the same block when a matching event fires.
2. Off-chain Reactivity
   `somnia_watch` pushes matching logs over WebSockets and can append read-only `eth_call` simulation results atomically.
3. Data Streams
   Streams give the agent a typed, composable memory layer without forcing a custom Solidity storage contract for every new record shape.

Relevant Somnia docs:

- [Network Info](https://docs.somnia.network/developer/network-info)
- [On-chain Reactivity](https://docs.somnia.network/developer/reactivity/reactivity-onchain)
- [Off-chain Reactivity](https://docs.somnia.network/developer/reactivity/reactivity-offchain)
- [Cron subscriptions via SDK](https://docs.somnia.network/developer/reactivity/tutorials/cron-subscriptions-via-sdk)
- [What is Somnia Data Streams?](https://docs.somnia.network/developer/data-streams/what-is-somnia-data-streams)
- [Intersection with Somnia Reactivity](https://docs.somnia.network/developer/data-streams/concepts/intersection-with-somnia-reactivity)
- [Read Stream Data from a UI](https://docs.somnia.network/developer/data-streams/tutorials/read-stream-data-from-a-ui-next.js-example)

## Product Thesis

### Target users

- DAO treasury operators
- protocol foundations and ecosystem funds
- game economies with automated payouts
- exchanges, market makers, and on-chain ops teams that want machine-speed guardrails

### Core pain points

- every withdrawal review path is too slow
- current bots are often non-verifiable and siloed
- incident data is fragmented across chat, dashboards, and scripts
- security automation often has weak blast-radius controls

### PMF hypothesis

Somtinel is strongest where teams already accept semi-autonomous execution but still need a human override lane for exceptions. The MVP is designed for that wedge:

- trusted payouts auto-settle
- suspicious payouts get quarantined
- agents publish a shared diagnostic record other apps can consume

## MVP Scope

### Smart contracts

- `TreasuryVault.sol`
  Operators request withdrawals. The vault only lets the responder execute or cancel them.
- `SomtinelResponder.sol`
  A reactive handler that:
  - subscribes to `WithdrawalRequested`
  - auto-executes safe requests
  - opens incidents for risky requests
  - schedules delayed escalation using Somnia's `Schedule(uint256)` system event

### Off-chain agent

- `scripts/agent.ts`
  Watches `IncidentOpened` via `somnia_watch`, pulls `getIncidentView()` atomically with `eth_calls + context`, computes an operator digest, and publishes it to Somnia Data Streams.

### Frontend

- Vite + React dashboard in `app/`
  - live incident rail
  - treasury request form
  - approval / rejection actions
  - stream-backed agent memory feed
  - demo fallback mode when env vars are absent

## Architecture

```text
Operator -> TreasuryVault.requestWithdrawal()
         -> event: WithdrawalRequested
         -> SomtinelResponder subscription fires in-chain
         -> safe: execute immediately
         -> risky: open incident + schedule review timeout
         -> off-chain agent watches IncidentOpened
         -> agent fetches incident state atomically
         -> agent writes typed digest to Somnia Streams
         -> dashboard reads contract state + stream memory
```

## Security Posture

Somtinel is intentionally conservative:

- vault execution is isolated behind a single responder address
- reactive handlers only accept calls from Somnia's `0x0100` precompile
- review flows default to quarantine, not auto-release
- every risky incident has a finite review deadline and explicit resolution path
- no recursive self-triggering event loop is created by default

Somnia's own reactivity docs warn about recursive event explosions, underfunded handlers, and treating `maxFeePerGas = 0` casually. The contract design and defaults here follow those constraints.

## Local Development

### 1. Install app dependencies

This repo assumes a local Node runtime is available. In this workspace, one was bootstrapped into `.tooling/`, but that directory is ignored and not part of the project.

```bash
npm install
```

### 2. Run the UI

```bash
npm run dev
```

Without env vars the app launches in demo mode.

### 3. Run tests

```bash
forge test
```

### 4. Build

```bash
npm run build
```

## Somnia Testnet Config

From the current Somnia docs:

- Chain ID: `50312`
- RPC: `https://api.infra.testnet.somnia.network/`
- WebSocket: `wss://api.infra.testnet.somnia.network/ws`
- Explorer: `https://shannon-explorer.somnia.network/`
- MulticallV3: `0x841b8199E6d3Db3C6f264f6C2bd8848b3cA64223`
- EntryPoint v0.7: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`

## Deployment Flow

1. Deploy `TreasuryVault` and `SomtinelResponder` with Foundry.
2. Fund the vault with STT.
3. Set the responder on the vault.
4. Mark at least one trusted destination.
5. Create the withdrawal subscription on `SomtinelResponder`.
6. Run `npm run agent` with the deployed addresses.
7. Point the frontend env vars to the same contracts and the agent wallet.

## Files

- [src/TreasuryVault.sol](./src/TreasuryVault.sol)
- [src/SomtinelResponder.sol](./src/SomtinelResponder.sol)
- [test/SomtinelResponder.t.sol](./test/SomtinelResponder.t.sol)
- [scripts/agent.ts](./scripts/agent.ts)
- [scripts/configureSomtinel.ts](./scripts/configureSomtinel.ts)
- [app/src/App.tsx](./app/src/App.tsx)

## Deploying

### Frontend (Vercel)

```bash
# Set env vars in Vercel dashboard or via CLI:
vercel env add VITE_SOMTINEL_VAULT_ADDRESS
vercel env add VITE_SOMTINEL_RESPONDER_ADDRESS
vercel env add VITE_SOMTINEL_STREAM_PUBLISHER
vercel --prod
```

The `vercel.json` is pre-configured. Vite builds to `dist/`, Vercel serves it as static.

### Off-chain Agent (Render)

The agent is a long-lived WebSocket process. Vercel can't run it (10s function timeout). Use Render, Railway, or Fly.io.

**Render**:
1. New Web Service → connect repo
2. Build command: `npm install`
3. Start command: `npm run agent`
4. Add env vars: `PRIVATE_KEY`, `SOMTINEL_RESPONDER_ADDRESS`, `SOMNIA_RPC_HTTP`, `SOMNIA_RPC_WS`
5. Deploy — the agent stays running and watches for incidents

**Railway**:
1. New Service → Deploy from GitHub repo
2. Start command: `npm run agent`
3. Add same env vars
4. Deploy

**Local** (for demo):
```bash
npm run agent
# Keep this terminal open — the agent watches WebSocket events continuously
```
