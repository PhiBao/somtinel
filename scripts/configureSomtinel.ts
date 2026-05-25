import "dotenv/config";

import { createPublicClient, createWalletClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { responderAbi, somniaShannon, vaultAbi } from "../shared/somtinel";

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const vaultAddr = process.env.SOMTINEL_VAULT_ADDRESS as `0x${string}` | undefined;
const responderAddr = process.env.SOMTINEL_RESPONDER_ADDRESS as `0x${string}` | undefined;
const safeDest = process.env.SAFE_DESTINATION as `0x${string}` | undefined;
const rpcUrl = process.env.SOMNIA_RPC_HTTP ?? "https://api.infra.testnet.somnia.network/";

const REQUIRED = "Set PRIVATE_KEY, SOMTINEL_VAULT_ADDRESS, SOMTINEL_RESPONDER_ADDRESS, and SAFE_DESTINATION in your environment.";
if (!privateKey || !vaultAddr || !responderAddr || !safeDest) throw new Error(REQUIRED);

const account = privateKeyToAccount(privateKey);
const vault = vaultAddr;
const responder = responderAddr;
const destination = safeDest;

const publicClient = createPublicClient({
  chain: somniaShannon,
  transport: http(rpcUrl),
});

const walletClient = createWalletClient({
  account,
  chain: somniaShannon,
  transport: http(rpcUrl),
});

async function main() {
  const owner = await publicClient.readContract({
    address: responder,
    abi: responderAbi,
    functionName: "owner",
  });

  if (String(owner).toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Wallet ${account.address} is not responder owner ${owner}`);
  }

  const vaultOwner = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "owner",
  });

  console.log("Responder owner:", owner);
  console.log("Vault owner:", vaultOwner);

  const setTrustedHash = await walletClient.writeContract({
    address: responder,
    abi: responderAbi,
    functionName: "setTrustedDestination",
    args: [destination, true],
  });

  console.log("Trusted destination tx:", setTrustedHash);
  await publicClient.waitForTransactionReceipt({ hash: setTrustedHash });

  const setResponderHash = await walletClient.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "setResponder",
    args: [responder],
  });

  console.log("Vault responder tx:", setResponderHash);
  await publicClient.waitForTransactionReceipt({ hash: setResponderHash });

  const subscriptionHash = await walletClient.writeContract({
    address: responder,
    abi: responderAbi,
    functionName: "createWithdrawalSubscription",
    args: [1n, 0n, 3_000_000n],
  });

  console.log("Subscription tx:", subscriptionHash);
  await publicClient.waitForTransactionReceipt({ hash: subscriptionHash });

  const subscriptionId = await publicClient.readContract({
    address: responder,
    abi: responderAbi,
    functionName: "withdrawalSubscriptionId",
  });

  const vaultBalance = await publicClient.getBalance({ address: vault });
  console.log("Vault balance:", formatEther(vaultBalance), "STT");
  console.log("Withdrawal subscription ID:", subscriptionId.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
