import "dotenv/config";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createPublicClient, createWalletClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  incidentStatusLabel,
  responderAbi,
  somniaShannon,
  vaultAbi,
} from "../shared/somtinel";

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const vaultAddress = process.env.SOMTINEL_VAULT_ADDRESS as `0x${string}` | undefined;
const responderAddress = process.env.SOMTINEL_RESPONDER_ADDRESS as `0x${string}` | undefined;

if (!privateKey || !vaultAddress || !responderAddress) {
  throw new Error("Set PRIVATE_KEY, SOMTINEL_VAULT_ADDRESS, and SOMTINEL_RESPONDER_ADDRESS");
}

const account = privateKeyToAccount(privateKey);

const publicClient = createPublicClient({ chain: somniaShannon, transport: http() });
const walletClient = createWalletClient({ account, chain: somniaShannon, transport: http() });

const server = new Server(
  { name: "somtinel", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "listIncidents",
      description: "List all incidents from the Somtinel Responder contract on Somnia Shannon testnet.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "getIncident",
      description: "Get full details of a specific incident by ID.",
      inputSchema: {
        type: "object",
        properties: { incidentId: { type: "number", description: "The incident ID" } },
        required: ["incidentId"],
      },
    },
    {
      name: "getVaultBalance",
      description: "Get the current STT balance of the TreasuryVault.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "previewRisk",
      description: "Preview the risk score for a withdrawal to a given destination and amount.",
      inputSchema: {
        type: "object",
        properties: {
          destination: { type: "string", description: "Destination address (0x...)" },
          amount: { type: "string", description: "Amount in STT (e.g. '5.0')" },
        },
        required: ["destination", "amount"],
      },
    },
    {
      name: "resolveIncident",
      description: "Approve or reject an incident. Requires owner wallet.",
      inputSchema: {
        type: "object",
        properties: {
          incidentId: { type: "number", description: "The incident ID to resolve" },
          approve: { type: "boolean", description: "true to approve and execute, false to reject and cancel" },
        },
        required: ["incidentId", "approve"],
      },
    },
    {
      name: "getRiskConfig",
      description: "Get current risk engine configuration (cutoff, default limit).",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "listIncidents": {
        const nextId = await publicClient.readContract({
          address: responderAddress, abi: responderAbi, functionName: "nextIncidentId",
        });
        const incidents = [];
        for (let i = 1n; i < nextId; i++) {
          const row = await publicClient.readContract({
            address: responderAddress, abi: responderAbi, functionName: "getIncidentView", args: [i],
          });
          incidents.push({
            incidentId: Number(i),
            requestId: Number(row[0]),
            destination: row[1],
            amount: formatEther(row[2]) + " STT",
            riskScore: Number(row[6]),
            status: incidentStatusLabel(Number(row[7])),
            trusted: row[8],
            reviewDeadline: new Date(Number(row[5])).toISOString(),
          });
        }
        return { content: [{ type: "text", text: JSON.stringify(incidents, null, 2) }] };
      }

      case "getIncident": {
        const row = await publicClient.readContract({
          address: responderAddress, abi: responderAbi, functionName: "getIncidentView",
          args: [BigInt(args?.incidentId as number)],
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              incidentId: args?.incidentId,
              requestId: Number(row[0]),
              destination: row[1],
              amount: formatEther(row[2]) + " STT",
              riskScore: Number(row[6]),
              status: incidentStatusLabel(Number(row[7])),
              trusted: row[8],
              reviewDeadline: new Date(Number(row[5])).toISOString(),
            }, null, 2),
          }],
        };
      }

      case "getVaultBalance": {
        const balance = await publicClient.getBalance({ address: vaultAddress });
        return { content: [{ type: "text", text: formatEther(balance) + " STT" }] };
      }

      case "previewRisk": {
        const [score, trusted, autoExecute] = await publicClient.readContract({
          address: responderAddress, abi: responderAbi, functionName: "previewRisk",
          args: [
            (args?.destination as `0x${string}`) ?? "0x",
            BigInt(Math.floor(Number(args?.amount || "0") * 1e18)),
          ],
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              riskScore: Number(score),
              trusted,
              autoExecute: autoExecute ? "yes — will auto-execute" : "no — will create incident",
            }, null, 2),
          }],
        };
      }

      case "resolveIncident": {
        const hash = await walletClient.writeContract({
          account: account.address,
          address: responderAddress,
          abi: responderAbi,
          functionName: "resolveIncident",
          args: [BigInt(args?.incidentId as number), (args?.approve as boolean) ?? false],
        });
        return { content: [{ type: "text", text: `Resolved incident #${args?.incidentId}. Tx: ${hash}` }] };
      }

      case "getRiskConfig": {
        const cutoff = await publicClient.readContract({
          address: responderAddress, abi: responderAbi, functionName: "riskCutoff",
        });
        const defaultLimit = await publicClient.readContract({
          address: responderAddress, abi: responderAbi, functionName: "defaultTrustedLimit",
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ riskCutoff: Number(cutoff), defaultTrustedLimit: formatEther(defaultLimit) + " STT" }, null, 2),
          }],
        };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error?.shortMessage ?? error?.message ?? error}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
