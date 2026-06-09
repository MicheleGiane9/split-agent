/**
 * deploy.js — Deploy and test the escrow on Pharos Atlantic
 * ==================================================================
 * 1. Compiles and deploys the contract (native PHRS or ERC-20, per PAYMENT_MODE).
 * 2. Runs a smoke test: creates a group and confirms the events.
 * 3. Prints the contract address to put in ESCROW_ADDRESS in .env.
 *
 * Usage:  node deploy.js
 * ==================================================================
 */
import "dotenv/config";
import { ethers } from "ethers";
import { compileForMode } from "./lib/compile.js";

async function main() {
  const { PHAROS_RPC_URL, PHAROS_CHAIN_ID, PRIVATE_KEY, USDC_ADDRESS, PAYMENT_MODE } = process.env;

  if (!PHAROS_RPC_URL || !PRIVATE_KEY) {
    throw new Error("Set PHAROS_RPC_URL and PRIVATE_KEY in .env (see .env.example).");
  }

  // Payment mode: "native" (PHRS) or "erc20" (USDC). Default: native.
  const native = (PAYMENT_MODE || "native").toLowerCase() !== "erc20";
  const contractName = native ? "SplitEscrowNative" : "SplitEscrow";

  console.log(`=== Deploying ${contractName} on Pharos (${native ? "native PHRS" : "USDC"} mode) ===`);

  // ---- Connection ----
  const provider = new ethers.JsonRpcProvider(PHAROS_RPC_URL);
  const wallet = new ethers.Wallet(
    PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : "0x" + PRIVATE_KEY,
    provider
  );

  const network = await provider.getNetwork();
  console.log(`Network: chainId ${network.chainId} (expected ${PHAROS_CHAIN_ID || "688689"})`);
  console.log(`Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Native balance: ${ethers.formatEther(balance)} PHRS`);
  if (balance === 0n) {
    console.log("⚠ Zero native balance — you need test PHRS to pay for gas.");
  }

  // ---- Compilation ----
  console.log(`\nCompiling ${contractName}.sol...`);
  const { abi, bytecode } = compileForMode(native);
  console.log("Compilation OK.");

  // ---- Deploy ----
  console.log("\nDeploying the contract...");
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`✅ Contract deployed at: ${address}`);
  console.log(`   Deploy tx: ${contract.deploymentTransaction()?.hash}`);

  // ---- Smoke test ----
  console.log("\nRunning smoke test (createSplit)...");

  // Dummy addresses just to validate group creation.
  const a = ethers.Wallet.createRandom().address;
  const b = ethers.Wallet.createRandom().address;

  // Sample amount: 0.001 PHRS (18 decimals) in native mode, or 1 USDC (6 decimals) in erc20.
  const sampleAmount = native ? ethers.parseEther("0.001") : 1000000n;

  const tx = native
    ? await contract.createSplit([a], [b], [sampleAmount], 86400)
    : await contract.createSplit(
        USDC_ADDRESS || "0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8",
        [a],
        [b],
        [sampleAmount],
        86400
      );
  const receipt = await tx.wait();

  let splitId = -1;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === "SplitCreated") {
        splitId = Number(parsed.args.splitId);
      }
    } catch (_) {
      /* ignore */
    }
  }
  console.log(`   Test group created (splitId=${splitId}, tx=${receipt.hash})`);

  const count = await contract.getDebtCount(splitId);
  const debt = await contract.getDebt(splitId, 0);
  console.log(`   Debts in the group: ${count}`);
  console.log(`   Debt[0]: ${debt[0]} -> ${debt[1]} | amount ${debt[2]} | paid=${debt[3]}`);

  console.log("\n==================================================");
  console.log(" Deploy complete. Add this to your .env:");
  console.log(`   ESCROW_ADDRESS=${address}`);
  console.log("==================================================");
}

main().catch((err) => {
  console.error("\n❌ Deploy error:", err.message);
  process.exit(1);
});
