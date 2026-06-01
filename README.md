# Somtinel

Agent-driven treasury risk response built on Somnia Reactivity, Data Streams, and the Model Context Protocol.

- Onchain reactivity for same-block autonomous execution
- Configurable risk engine with per-destination limits
- Somnia Data Streams for typed, composable agent memory
- MCP server for AI-native treasury operations (Cursor, Claude Desktop)
- Cyberpunk terminal dashboard with live WebSocket updates

## Problem

Crypto treasuries still live in a bad middle ground:

- Multisig flows are too manual to react at machine speed
- Automation is often brittle, opaque, or offchain only
- Risk engines rarely leave verifiable, structured state that other agents can consume

Somtinel turns a treasury withdrawal into an agent-native flow. Trusted payouts auto-settle. Suspicious ones open onchain incidents. An offchain agent enriches them with typed diagnostics. AI agents can query and act via MCP.

## Product Thesis

### Target users

- DAO treasury operators
- protocol foundations and ecosystem funds
- game economies with automated payouts
- exchanges, market makers, and onchain ops teams that want machine-speed guardrails

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

## Deployed Contracts (Somnia Shannon Testnet)

| Contract | Address |
|---|---|
| TreasuryVault | `0xef673bdac2c86506874919b1ad05bd7d7fa64344` |
| SomtinelResponder v2 | `0x47B4c6950FEDd791E584B2Fcf2C5f9816bE7480F` |
| Reactive Subscription | ID `3766601` (3M gas) |

## Architecture

```
Operator → TreasuryVault.requestWithdrawal()
         → WithdrawalRequested event
         → SomtinelResponder fires in-chain (0x0100 precompile)
           • Trusted + under limit → auto-execute
           • Risky → open incident onchain
         → Offchain agent watches IncidentOpened
         → Agent publishes typed digest to Somnia Data Streams
         → Dashboard reads chain state + stream memory
         → MCP server exposes tools to AI agents
```

## Quick Start

```bash
npm install
npm run dev          # dashboard at localhost:5173
forge test           # 9/9 Solidity tests
npm run build        # tsc + vite build
npm run agent        # offchain agent (WebSocket → Streams)
npm run mcp          # MCP server (AI agent tools)
npm run check        # build + forge test
```

## Features

### Smart Contracts
- `TreasuryVault.sol` — withdrawal request lifecycle: request, execute, cancel
- `SomtinelResponder.sol` — reactive handler with configurable risk engine
  - `setRiskConfig(cutoff, limit)` — tune risk thresholds post-deployment
  - `setDestinationLimit(dest, limit)` — per-destination override
  - `previewRisk(dest, amount)` — predict outcome before submitting
  - `resolveIncident(id, approve)` — owner approval/rejection

### Dashboard
- Live incident rail with WebSocket push updates
- Treasury request form with inline `previewRisk` (shows whether it'll auto-execute or create an incident before you submit)
- Owner-only config panel (risk cutoff, default limit, per-destination caps)
- Stream-backed agent memory feed with contextual diagnostics
- 12-second auto-polling + WebSocket live push
- Auto chain switching (prompts MetaMask to switch to Somnia)

### Offchain Agent
- Watches `IncidentOpened` events via WebSocket
- Atomically fetches incident state with `eth_call` simulation
- Contextual enrichment: repeat destination detection, burst activity flags, large amount warnings
- Rolling 50-incident window for pattern analysis
- Publishes typed digests to Somnia Data Streams

### MCP Server
- 6 tools: `listIncidents`, `getIncident`, `getVaultBalance`, `previewRisk`, `resolveIncident`, `getRiskConfig`
- Stdio transport — works with Cursor, Claude Desktop, and any MCP client
- `.cursor/mcp.json` pre-configured for Cursor

## Environment

Copy `.env.example` → `.env` (for scripts) and `app/.env` (for frontend):

```bash
PRIVATE_KEY=0x...
SOMNIA_RPC_HTTP=https://api.infra.testnet.somnia.network/
SOMNIA_RPC_WS=wss://api.infra.testnet.somnia.network/ws
SOMTINEL_VAULT_ADDRESS=0x...
SOMTINEL_RESPONDER_ADDRESS=0x...
SOMTINEL_STREAM_PUBLISHER=0x...
SAFE_DESTINATION=0x...

# frontend (app/.env — VITE_ prefixed)
VITE_SOMTINEL_VAULT_ADDRESS=0x...
VITE_SOMTINEL_RESPONDER_ADDRESS=0x...
VITE_SOMTINEL_STREAM_PUBLISHER=0x...
```

## Deploying

### Frontend (Vercel)
```bash
vercel env add VITE_SOMTINEL_VAULT_ADDRESS
vercel env add VITE_SOMTINEL_RESPONDER_ADDRESS
vercel env add VITE_SOMTINEL_STREAM_PUBLISHER
vercel --prod
```
`vercel.json` is pre-configured. Vite builds to `dist/`.

### Agent (Render — Background Worker)

The agent is a WebSocket client, not an HTTP server — it doesn't bind a port. Render requires a **Background Worker** (not a Web Service):

1. New Background Worker → connect repo
2. Build command: `npm install`
3. Start command: `npm run agent`
4. Add env vars: `PRIVATE_KEY`, `SOMTINEL_RESPONDER_ADDRESS`, `SOMNIA_RPC_HTTP`, `SOMNIA_RPC_WS`
5. Deploy — the agent stays running and publishes to Streams

The `render.yaml` is pre-configured with `type: worker`.

### MCP Server (Cursor)
Pre-configured in `.cursor/mcp.json`. Cursor auto-discovers it. For Claude Desktop, add to `claude_desktop_config.json`.

## Files

- [src/TreasuryVault.sol](./src/TreasuryVault.sol)
- [src/SomtinelResponder.sol](./src/SomtinelResponder.sol)
- [test/SomtinelResponder.t.sol](./test/SomtinelResponder.t.sol)
- [scripts/agent.ts](./scripts/agent.ts)
- [scripts/configureSomtinel.ts](./scripts/configureSomtinel.ts)
- [scripts/mcp-server.ts](./scripts/mcp-server.ts)
- [app/src/App.tsx](./app/src/App.tsx)
- [submission.md](./submission.md)
- [DEMO_SCRIPT.md](./DEMO_SCRIPT.md)
