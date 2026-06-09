/**
 * Skill: auto-pay
 * ------------------------------------------------------------------
 * Executes automatic payments from each debtor into the escrow contract,
 * in the spirit of Pharos's x402 protocol (machine-to-machine payments).
 *
 * Supports two modes:
 *  - native = true  -> pays in native PHRS (sends msg.value on deposit)
 *  - native = false -> pays in an ERC-20 token (approve + deposit via transferFrom)
 *
 * For each debt:
 *   1. Check the debtor's balance BEFORE paying.
 *   2. (ERC-20) Approve the escrow if needed.
 *   3. Call deposit() on the escrow.
 *   4. On transient failure, retry automatically with backoff.
 * ------------------------------------------------------------------
 */
import { ethers } from "ethers";
import { ERC20_ABI } from "../../lib/compile.js";

/**
 * @typedef {Object} PaymentJob
 * @property {number} debtIndex     Debt index within the group.
 * @property {ethers.Wallet} signer Debtor wallet (already connected to the provider).
 * @property {bigint} amountWei     Amount to pay, in token/coin units.
 * @property {string} fromName      Debtor name (for logging).
 */

/**
 * Execute all payments of a split group.
 *
 * @param {Object} params
 * @param {string} params.escrowAddress  Escrow contract address.
 * @param {object[]} params.escrowAbi    Escrow contract ABI.
 * @param {string} [params.tokenAddress] ERC-20 token address (USDC). Ignored in native mode.
 * @param {number} params.splitId        On-chain group ID.
 * @param {PaymentJob[]} params.jobs     List of payments to execute.
 * @param {number} [params.maxRetries=3] Max attempts per payment.
 * @param {boolean} [params.native=false] If true, pays in native PHRS (msg.value).
 * @param {function} [params.log=console.log] Logging function.
 * @returns {Promise<{ results: object[], allPaid: boolean }>}
 */
export async function executePayments({
  escrowAddress,
  escrowAbi,
  tokenAddress,
  splitId,
  jobs,
  maxRetries = 3,
  native = false,
  log = console.log,
}) {
  const results = [];

  for (const job of jobs) {
    const result = await payWithRetry({
      escrowAddress,
      escrowAbi,
      tokenAddress,
      splitId,
      job,
      maxRetries,
      native,
      log,
    });
    results.push(result);
  }

  const allPaid = results.every((r) => r.success);
  return { results, allPaid };
}

/**
 * Try to execute a payment with retry and exponential backoff.
 */
async function payWithRetry({
  escrowAddress,
  escrowAbi,
  tokenAddress,
  splitId,
  job,
  maxRetries,
  native,
  log,
}) {
  const { signer, amountWei, debtIndex, fromName } = job;
  const payer = await signer.getAddress();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const escrow = new ethers.Contract(escrowAddress, escrowAbi, signer);
      let receipt;

      if (native) {
        // ---- Native PHRS mode ----
        // 1. Check the native balance BEFORE paying (x402 style: verify funds).
        const balance = await signer.provider.getBalance(payer);
        if (balance < amountWei) {
          throw new Error(
            `insufficient balance: has ${balance.toString()}, needs ${amountWei.toString()} (+ gas)`
          );
        }
        // 2. Deposit sending PHRS along (msg.value).
        const depositTx = await escrow.deposit(splitId, debtIndex, { value: amountWei });
        receipt = await depositTx.wait();
      } else {
        // ---- ERC-20 (USDC) mode ----
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

        // 1. Check the balance BEFORE paying (x402 style: verify funds).
        const balance = await token.balanceOf(payer);
        if (balance < amountWei) {
          throw new Error(
            `insufficient balance: has ${balance.toString()}, needs ${amountWei.toString()}`
          );
        }

        // 2. Approve the escrow only if the current allowance is below the amount.
        const allowance = await token.allowance(payer, escrowAddress);
        if (allowance < amountWei) {
          const approveTx = await token.approve(escrowAddress, amountWei);
          await approveTx.wait();
          log(`   [auto-pay] ${fromName}: approve confirmed (${approveTx.hash})`);
        }

        // 3. Deposit into the escrow (the contract pulls the amount via transferFrom).
        const depositTx = await escrow.deposit(splitId, debtIndex);
        receipt = await depositTx.wait();
      }

      log(`   [auto-pay] ${fromName}: payment confirmed (${receipt.hash})`);
      return {
        fromName,
        payer,
        debtIndex,
        success: true,
        txHash: receipt.hash,
        attempts: attempt,
      };
    } catch (err) {
      log(`   [auto-pay] ${fromName}: attempt ${attempt}/${maxRetries} failed — ${err.message}`);

      // Insufficient balance won't be fixed by retrying; abort this job.
      if (/insufficient balance/.test(err.message)) {
        return {
          fromName,
          payer,
          debtIndex,
          success: false,
          error: err.message,
          attempts: attempt,
        };
      }

      if (attempt < maxRetries) {
        const delayMs = 1000 * 2 ** (attempt - 1); // backoff: 1s, 2s, 4s...
        await sleep(delayMs);
      } else {
        return {
          fromName,
          payer,
          debtIndex,
          success: false,
          error: err.message,
          attempts: attempt,
        };
      }
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
