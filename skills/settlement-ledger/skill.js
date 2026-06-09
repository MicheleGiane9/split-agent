/**
 * Skill: settlement-ledger
 * ------------------------------------------------------------------
 * Performs the final on-chain settlement of the group (settle) and
 * records the result immutably. It also offers a public query of the
 * settled-group history by reading the contract events.
 *
 * The "ledger" is the blockchain itself: the Settled event emitted by
 * the contract is the source of truth. This skill also writes a local
 * JSON record for quick off-chain lookups.
 * ------------------------------------------------------------------
 */
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

/**
 * Settle the group and record the settlement.
 *
 * @param {Object} params
 * @param {string} params.escrowAddress Escrow contract address.
 * @param {object[]} params.escrowAbi   Contract ABI.
 * @param {ethers.Wallet} params.wallet Signer that triggers the settlement.
 * @param {number} params.splitId       Group ID.
 * @param {Object} [params.meta]        Extra metadata (group name, description...).
 * @param {string} [params.ledgerPath]  Path of the local history file (JSON).
 * @param {function} [params.log=console.log] Logging function.
 * @returns {Promise<Object>} The settlement record.
 */
export async function settleAndRecord({
  escrowAddress,
  escrowAbi,
  wallet,
  splitId,
  meta = {},
  ledgerPath,
  log = console.log,
}) {
  try {
    const escrow = new ethers.Contract(escrowAddress, escrowAbi, wallet);

    // Make sure the group is fully paid before settling.
    const fullyPaid = await escrow.isFullyPaid(splitId);
    if (!fullyPaid) {
      throw new Error(`group ${splitId} is not fully paid yet.`);
    }

    const tx = await escrow.settle(splitId);
    const receipt = await tx.wait();

    // Extract data from the Settled event.
    let totalTransferred = 0n;
    let timestamp = Math.floor(Date.now() / 1000);
    for (const logEntry of receipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(logEntry);
        if (parsed && parsed.name === "Settled") {
          totalTransferred = parsed.args.totalTransferred;
          timestamp = Number(parsed.args.timestamp);
          break;
        }
      } catch (_) {
        /* log from another contract */
      }
    }

    const record = {
      group: meta.group || `split-${splitId}`,
      description: meta.description || "",
      splitId,
      escrowAddress,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      totalTransferred: totalTransferred.toString(),
      timestamp,
      isoDate: new Date(timestamp * 1000).toISOString(),
      transfers: meta.transfers || [],
    };

    log(`   [settlement-ledger] group ${splitId} settled (${receipt.hash})`);

    // Write the immutable local record (append-only).
    if (ledgerPath) {
      appendToLedger(ledgerPath, record);
      log(`   [settlement-ledger] record saved to ${ledgerPath}`);
    }

    return record;
  } catch (err) {
    throw new Error(`settlement-ledger failed: ${err.message}`);
  }
}

/**
 * Public query of the settled-group history by reading Settled events
 * directly from the blockchain.
 *
 * @param {Object} params
 * @param {string} params.escrowAddress Contract address.
 * @param {object[]} params.escrowAbi   Contract ABI.
 * @param {ethers.Provider} params.provider Read provider.
 * @param {number} [params.fromBlock=0] Start block of the search.
 * @returns {Promise<object[]>} List of on-chain settlements.
 */
export async function queryHistory({ escrowAddress, escrowAbi, provider, fromBlock = 0 }) {
  const escrow = new ethers.Contract(escrowAddress, escrowAbi, provider);
  const events = await escrow.queryFilter(escrow.filters.Settled(), fromBlock, "latest");

  return events.map((e) => ({
    splitId: Number(e.args.splitId),
    totalTransferred: e.args.totalTransferred.toString(),
    timestamp: Number(e.args.timestamp),
    isoDate: new Date(Number(e.args.timestamp) * 1000).toISOString(),
    txHash: e.transactionHash,
    blockNumber: e.blockNumber,
  }));
}

/** Append a record to the local history file (creates it if missing). */
function appendToLedger(ledgerPath, record) {
  const dir = path.dirname(ledgerPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let ledger = [];
  if (fs.existsSync(ledgerPath)) {
    try {
      ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
      if (!Array.isArray(ledger)) ledger = [];
    } catch (_) {
      ledger = [];
    }
  }
  ledger.push(record);
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}
