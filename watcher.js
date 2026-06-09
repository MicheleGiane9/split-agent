/**
 * watcher.js — Split Agent AUTONOMOUS mode
 * ==================================================================
 * This is what makes Split Agent a real agent: instead of settling
 * everything in a single command, it WATCHES the escrow contract and,
 * as soon as it detects a group is fully paid, it calls settle() BY
 * ITSELF — with no human intervention.
 *
 * It uses lightweight polling (not eth_newFilter subscriptions), so it
 * works on RPCs that don't support live filters (like Pharos Atlantic).
 *
 * Autonomous flow:
 *   1. Connect to Pharos and the escrow contract (ESCROW_ADDRESS).
 *   2. Every few seconds, scan all groups; log new deposits as they land.
 *   3. When a group becomes fully paid, call settle() and record the
 *      immutable result via the settlement-ledger skill.
 *   4. Keep running indefinitely.
 *
 * Usage:
 *   node watcher.js
 * ==================================================================
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

import { compileForMode } from "./lib/compile.js";
import { settleAndRecord } from "./skills/settlement-ledger/skill.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Readable timestamp for logs. */
function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

async function main() {
  const { PHAROS_RPC_URL, PRIVATE_KEY, ESCROW_ADDRESS, PAYMENT_MODE } = process.env;
  const native = (PAYMENT_MODE || "native").toLowerCase() !== "erc20";

  if (!PHAROS_RPC_URL || !PRIVATE_KEY) {
    throw new Error("Set PHAROS_RPC_URL and PRIVATE_KEY in .env (see .env.example).");
  }
  if (!ESCROW_ADDRESS) {
    throw new Error(
      "Set ESCROW_ADDRESS in .env with the deployed escrow address (run 'npm run deploy' first)."
    );
  }

  // How often to scan the contract (ms).
  const POLL_MS = 5000;

  const provider = new ethers.JsonRpcProvider(PHAROS_RPC_URL);
  const wallet = new ethers.Wallet(
    PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : "0x" + PRIVATE_KEY,
    provider
  );

  const { abi } = compileForMode(native);
  const escrow = new ethers.Contract(ESCROW_ADDRESS, abi, wallet);
  const ledgerPath = path.resolve(__dirname, "ledger.json");

  // Bookkeeping to avoid duplicate work and to detect new deposits.
  const settledInSession = new Set();
  const inFlight = new Set();
  const lastPaidCount = new Map(); // splitId -> last seen paidDebts

  console.log("==================================================");
  console.log(" SPLIT AGENT — AUTONOMOUS mode (watcher)");
  console.log("==================================================");
  log(`Agent: ${wallet.address}`);
  log(`Escrow: ${ESCROW_ADDRESS}`);
  log(`Watching for deposits every ${POLL_MS / 1000}s... (Ctrl+C to exit)`);

  /** Settle a group if it is fully paid and not yet settled. */
  async function trySettle(splitId) {
    if (settledInSession.has(splitId) || inFlight.has(splitId)) return;
    inFlight.add(splitId);
    try {
      log(`✅ Group ${splitId} is 100% paid — settling automatically...`);
      const record = await settleAndRecord({
        escrowAddress: ESCROW_ADDRESS,
        escrowAbi: abi,
        wallet,
        splitId,
        meta: { group: `auto-settled-split-${splitId}` },
        ledgerPath,
        log: (m) => log(m.trim()),
      });
      settledInSession.add(splitId);
      log(`🎉 Group ${splitId} settled on its own! tx=${record.txHash} total=${record.totalTransferred}`);
    } catch (err) {
      log(`⚠ Error settling group ${splitId}: ${err.message}`);
    } finally {
      inFlight.delete(splitId);
    }
  }

  /** One scan pass over all groups. */
  let scanning = false;
  async function scan() {
    if (scanning) return; // avoid overlapping scans
    scanning = true;
    try {
      const total = Number(await escrow.nextSplitId());
      for (let id = 0; id < total; id++) {
        if (settledInSession.has(id)) continue;

        const s = await escrow.splits(id);
        if (s.settled) {
          settledInSession.add(id);
          continue;
        }

        const paid = Number(s.paidDebts);
        const totalDebts = Number(s.totalDebts);
        if (totalDebts === 0) continue;

        // Log newly observed deposits (paid count went up).
        const prev = lastPaidCount.get(id) ?? 0;
        if (paid > prev) {
          log(`💸 Deposit detected in group ${id} (${paid}/${totalDebts} paid).`);
          lastPaidCount.set(id, paid);
        }

        // Fully paid -> settle autonomously.
        if (paid === totalDebts) {
          await trySettle(id);
        }
      }
    } catch (err) {
      log(`⚠ Scan error: ${err.message}`);
    } finally {
      scanning = false;
    }
  }

  // First scan immediately, then on every interval.
  await scan();
  setInterval(scan, POLL_MS);

  // Keep the process alive.
  process.stdin.resume();
}

main().catch((err) => {
  console.error("\n❌ Watcher error:", err.message);
  process.exit(1);
});
