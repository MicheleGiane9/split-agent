/**
 * Split Agent — Orchestrator
 * ==================================================================
 * Takes a natural-language instruction, runs the 4 skills in sequence
 * and settles the bill split on-chain on Pharos:
 *
 *   1. split-calculator   -> computes who pays whom and how much
 *   2. escrow-deployer    -> deploys/uses the escrow and creates the on-chain group
 *   3. auto-pay           -> charges each debtor automatically (x402 style)
 *   4. settlement-ledger  -> settles and records the immutable result
 *
 * Payment mode via PAYMENT_MODE in .env:
 *   native (default) -> native PHRS   |   erc20 -> USDC token
 *
 * Usage:
 *   node agent.js "We were 4 at the restaurant, John paid 100, Mary paid 60, Pete paid 40, Ann paid nothing"
 *   node agent.js --no-settle "..."   # defer settlement to the autonomous watcher
 * ==================================================================
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ethers } from "ethers";

import { calculateSplit } from "./skills/split-calculator/skill.js";
import { deployEscrowAndCreateSplit } from "./skills/escrow-deployer/skill.js";
import { executePayments } from "./skills/auto-pay/skill.js";
import { settleAndRecord } from "./skills/settlement-ledger/skill.js";

import { parseNaturalLanguage } from "./lib/parser.js";
import { resolveWallets } from "./lib/wallets.js";
import { ERC20_ABI } from "./lib/compile.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Log with a numbered step prefix. */
function step(n, msg) {
  console.log(`\n[Step ${n}] ${msg}`);
}

/**
 * Run the full agent flow.
 * @param {string} instruction Natural-language sentence.
 * @param {Object} [options]
 * @param {boolean} [options.autoSettle=true] If false, sets up and pays but does
 *        NOT settle — leaving settlement to the autonomous watcher (watcher.js).
 */
export async function runAgent(instruction, options = {}) {
  const { autoSettle = true } = options;

  console.log("==================================================");
  console.log(" SPLIT AGENT — on-chain bill splitting (Pharos)");
  console.log("==================================================");
  console.log(`Instruction: "${instruction}"`);

  // ---- Environment ----
  const {
    PHAROS_RPC_URL,
    PRIVATE_KEY,
    USDC_ADDRESS,
    ESCROW_ADDRESS,
    PARTICIPANT_KEYS,
    PAYMENT_MODE,
  } = process.env;

  // Payment mode: "native" (native PHRS) or "erc20" (USDC). Default: native.
  const native = (PAYMENT_MODE || "native").toLowerCase() !== "erc20";

  if (!PHAROS_RPC_URL || !PRIVATE_KEY) {
    throw new Error(
      "Set PHAROS_RPC_URL and PRIVATE_KEY in your .env file (see .env.example)."
    );
  }
  if (!native && !USDC_ADDRESS) {
    throw new Error("In erc20 mode you must set USDC_ADDRESS in .env.");
  }
  console.log(`Payment mode: ${native ? "native PHRS" : "ERC-20 (USDC)"}`);

  const provider = new ethers.JsonRpcProvider(PHAROS_RPC_URL);
  const agentWallet = new ethers.Wallet(
    PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : "0x" + PRIVATE_KEY,
    provider
  );
  console.log(`Agent wallet: ${agentWallet.address}`);

  // ---- Step 0: parse the natural language ----
  step(0, "Parsing the natural-language instruction...");
  const { description, participants } = parseNaturalLanguage(instruction);
  console.log(`   Context: ${description}`);
  console.table(participants);

  // Resolve participant wallets (addresses + test signers).
  const walletMap = resolveWallets(participants, provider, PARTICIPANT_KEYS);

  // ---- Step 1: split-calculator ----
  step(1, "Computing the split (split-calculator)...");
  const { transfers, total, perPerson, balances } = calculateSplit(participants);
  console.log(`   Total: ${total} | Per person: ${perPerson}`);
  console.log("   Balances:", balances);
  if (transfers.length === 0) {
    console.log("   Everyone is already even. Nothing to settle. ✅");
    return { settled: false, reason: "already-even" };
  }
  console.log("   Required transfers:");
  for (const t of transfers) console.log(`     ${t.from} -> ${t.to}: ${t.amount}`);

  // Determine token decimals to convert amounts correctly.
  // Native PHRS uses 18 decimals; USDC is usually 6.
  let decimals = 18;
  if (!native) {
    decimals = 6;
    try {
      const token = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
      decimals = Number(await token.decimals());
    } catch (_) {
      console.log("   (Could not read decimals(); assuming 6.)");
    }
  }

  // Convert transfers to on-chain format (addresses + wei).
  const onChainTransfers = transfers.map((t) => ({
    fromAddress: walletMap[t.from].address,
    toAddress: walletMap[t.to].address,
    amountWei: ethers.parseUnits(t.amount.toFixed(decimals), decimals),
  }));

  // ---- Step 2: escrow-deployer ----
  step(2, "Deploying/using the escrow and creating the group (escrow-deployer)...");
  const { escrowAddress, splitId, txHash, abi } = await deployEscrowAndCreateSplit({
    wallet: agentWallet,
    tokenAddress: USDC_ADDRESS,
    transfers: onChainTransfers,
    durationSeconds: 86400,
    escrowAddress: ESCROW_ADDRESS || undefined,
    native,
  });
  console.log(`   Escrow: ${escrowAddress}`);
  console.log(`   Group (splitId): ${splitId} | tx: ${txHash}`);

  // ---- Step 3: auto-pay ----
  step(3, "Charging participants automatically (auto-pay / x402)...");

  // Build the payment jobs. Each debtor needs a funded signer.
  const jobs = [];
  let missingKeys = false;
  transfers.forEach((t, i) => {
    const payer = walletMap[t.from];
    if (!payer.signer) {
      missingKeys = true;
      console.log(
        `   ⚠ ${t.from} has no wallet in PARTICIPANT_KEYS — payment will be skipped.`
      );
      return;
    }
    jobs.push({
      debtIndex: i,
      signer: payer.signer,
      amountWei: onChainTransfers[i].amountWei,
      fromName: t.from,
    });
  });

  if (missingKeys || jobs.length < transfers.length) {
    console.log("\n   Not all participants have a test wallet configured.");
    console.log(
      "   The group was created on-chain; set PARTICIPANT_KEYS to complete the payments."
    );
    return { settled: false, escrowAddress, splitId, txHash, reason: "missing-payer-keys" };
  }

  const { results, allPaid } = await executePayments({
    escrowAddress,
    escrowAbi: abi,
    tokenAddress: USDC_ADDRESS,
    splitId,
    jobs,
    maxRetries: 3,
    native,
  });

  if (!allPaid) {
    console.log("\n   ⚠ Not all payments were confirmed:");
    console.table(results);
    return { settled: false, escrowAddress, splitId, results, reason: "payments-incomplete" };
  }
  console.log("   All payments confirmed. ✅");

  // ---- Autonomous mode: defer settlement to the watcher ----
  if (!autoSettle) {
    console.log("\n==================================================");
    console.log(" Autonomous mode: settlement delegated to the watcher.");
    console.log("==================================================");
    console.log(`   Group ${splitId} is fully paid in escrow ${escrowAddress}.`);
    console.log("   Run (or keep running) 'npm run watch' — the autonomous agent");
    console.log("   detects the deposits and calls settle() by itself.");
    return { settled: false, escrowAddress, splitId, abi, reason: "deferred-to-watcher" };
  }

  // ---- Step 4: settlement-ledger ----
  step(4, "Settling and recording the result (settlement-ledger)...");
  const ledgerPath = path.resolve(__dirname, "ledger.json");
  const record = await settleAndRecord({
    escrowAddress,
    escrowAbi: abi,
    wallet: agentWallet,
    splitId,
    meta: { group: description, description, transfers },
    ledgerPath,
  });

  // ---- Final notification ----
  console.log("\n==================================================");
  console.log(" ✅ Split settled successfully!");
  console.log("==================================================");
  console.log(`   Group:   ${record.group}`);
  console.log(`   Total settled (wei): ${record.totalTransferred}`);
  console.log(`   Tx hash: ${record.txHash}`);
  console.log(`   Date:    ${record.isoDate}`);
  console.log("   Participants notified:");
  for (const p of participants) {
    console.log(`     - ${p.name} (${walletMap[p.name].address})`);
  }

  return { settled: true, record, escrowAddress, splitId };
}

// ------------------------------------------------------------------
// Command-line execution
// (pathToFileURL ensures compatibility on Windows and Linux)
// ------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rawArgs = process.argv.slice(2);

  // Flags: --no-settle (or --watch) defers settlement to the autonomous watcher.
  const deferSettle = rawArgs.some((a) => a === "--no-settle" || a === "--watch");
  const instruction =
    rawArgs.filter((a) => !a.startsWith("--")).join(" ") ||
    "We were 4 at the restaurant, John paid 100, Mary paid 60, Pete paid 40, Ann paid nothing";

  runAgent(instruction, { autoSettle: !deferSettle })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ Agent error:", err.message);
      process.exit(1);
    });
}
