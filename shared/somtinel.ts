import { defineChain, keccak256, parseAbi, stringToHex } from "viem";

export const SOMNIA_TESTNET_CHAIN_ID = 50312;
export const SOMNIA_TESTNET_HTTP_RPC = "https://api.infra.testnet.somnia.network/";
export const SOMNIA_TESTNET_WS_RPC = "wss://api.infra.testnet.somnia.network/ws";
export const SOMNIA_TESTNET_EXPLORER = "https://shannon-explorer.somnia.network";
export const SOMNIA_REACTIVITY_PRECOMPILE = "0x0000000000000000000000000000000000000100";

export const somniaShannon = defineChain({
  id: SOMNIA_TESTNET_CHAIN_ID,
  name: "Somnia Shannon Testnet",
  nativeCurrency: {
    name: "Somnia Test Token",
    symbol: "STT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [SOMNIA_TESTNET_HTTP_RPC],
      webSocket: [SOMNIA_TESTNET_WS_RPC],
    },
    public: {
      http: [SOMNIA_TESTNET_HTTP_RPC],
      webSocket: [SOMNIA_TESTNET_WS_RPC],
    },
  },
  blockExplorers: {
    default: {
      name: "Shannon Explorer",
      url: SOMNIA_TESTNET_EXPLORER,
    },
  },
  testnet: true,
});

export const incidentStatusLabels = [
  "None",
  "AutoExecuted",
  "NeedsReview",
  "Escalated",
  "Cancelled",
  "Cleared",
] as const;

export function incidentStatusLabel(code: number) {
  return incidentStatusLabels[code] ?? `Unknown(${code})`;
}

export const withdrawalRequestedTopic = keccak256(
  stringToHex("WithdrawalRequested(uint256,address,uint256,bytes32,address)")
);
export const incidentOpenedTopic = keccak256(
  stringToHex("IncidentOpened(uint256,address,uint256,bytes32,uint256,bool)")
);
export const getIncidentViewSelector = "0x5d1dc96b";

export const SOMTINEL_STREAM_SCHEMA =
  "uint64 timestamp, uint256 incidentId, uint8 riskScore, string status, string summary, string recommendedAction, address target, uint256 amount";
export const SOMTINEL_STREAM_SCHEMA_NAME = "somtinel_incident_digest_v1";

export const vaultAbi = parseAbi([
  "function nextRequestId() view returns (uint256)",
  "function responder() view returns (address)",
  "function requestWithdrawal(address to, uint256 amount, bytes32 reasonHash) returns (uint256 requestId)",
  "function getRequestView(uint256 requestId) view returns (address requester, address to, uint256 amount, bytes32 reasonHash, uint64 createdAt, bool executed, bool cancelled)",
  "function setResponder(address newResponder)",
  "function owner() view returns (address)",
  "event WithdrawalRequested(uint256 indexed requestId, address to, uint256 amount, bytes32 indexed reasonHash, address requester)",
  "event WithdrawalExecuted(uint256 indexed requestId, address indexed to, uint256 amount, bytes32 indexed reasonHash, address executor)"
]);

export const responderAbi = parseAbi([
  "function nextIncidentId() view returns (uint256)",
  "function withdrawalSubscriptionId() view returns (uint256)",
  "function previewRisk(address destination, uint256 amount) view returns (uint8 score, bool trusted, bool autoExecute)",
  "function setTrustedDestination(address destination, bool isTrusted)",
  "function createWithdrawalSubscription(uint64 priorityFeePerGas, uint64 maxFeePerGas, uint64 gasLimit) returns (uint256 subscriptionId)",
  "function resolveIncident(uint256 incidentId, bool approve)",
  "function owner() view returns (address)",
  "function getIncidentView(uint256 incidentId) view returns (uint256 requestId, address destination, uint256 amount, bytes32 reasonHash, uint64 openedAt, uint64 reviewDeadlineMs, uint8 riskScore, uint8 status, bool destinationTrusted)",
  "event IncidentOpened(uint256 indexed incidentId, address indexed destination, uint256 amount, bytes32 indexed reasonHash, uint256 requestId, bool autoExecuted)",
  "event IncidentEscalated(uint256 indexed incidentId, uint256 reviewDeadlineMs)",
  "event IncidentResolved(uint256 indexed incidentId, bool approved, uint8 newStatus)"
]);
