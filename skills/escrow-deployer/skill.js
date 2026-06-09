/**
 * Skill: escrow-deployer
 * ------------------------------------------------------------------
 * Deploys an escrow contract on Pharos and creates an on-chain split
 * group with the list of debts computed by split-calculator.
 *
 * Supports two modes:
 *  - native = true  -> uses SplitEscrowNative.sol (native PHRS)
 *  - native = false -> uses SplitEscrow.sol (ERC-20 token / USDC)
 *
 * Can reuse an already-deployed contract (escrowAddress) or deploy a new one.
 * Emits the SplitCreated event on-chain when the group is created.
 * ------------------------------------------------------------------
 */
import { ethers } from "ethers";
import { compileForMode } from "../../lib/compile.js";

/**
 * @typedef {Object} OnChainTransfer
 * @property {string} fromAddress Debtor address.
 * @property {string} toAddress   Creditor address.
 * @property {bigint} amountWei   Amount already converted to token/coin units.
 */

/**
 * Deploy (if needed) the escrow and create the split group on-chain.
 *
 * @param {Object} params
 * @param {ethers.Wallet} params.wallet      Agent wallet (signer).
 * @param {string} [params.tokenAddress]     ERC-20 token address (USDC). Ignored in native mode.
 * @param {OnChainTransfer[]} params.transfers On-chain debts.
 * @param {number} [params.durationSeconds=86400] Deadline in seconds (default 24h).
 * @param {string} [params.escrowAddress]    Address of an already-deployed escrow (optional).
 * @param {boolean} [params.native=false]    If true, uses the native PHRS contract.
 * @returns {Promise<{ escrowAddress: string, splitId: number, txHash: string, abi: object[] }>}
 */
export async function deployEscrowAndCreateSplit({
  wallet,
  tokenAddress,
  transfers,
  durationSeconds = 86400,
  escrowAddress,
  native = false,
}) {
  if (!wallet) throw new Error("escrow-deployer: 'wallet' is required.");
  if (!transfers || transfers.length === 0) {
    throw new Error("escrow-deployer: there are no transfers to register.");
  }

  const { abi, bytecode } = compileForMode(native);
  let escrow;

  try {
    if (escrowAddress) {
      // Reuse an already-deployed contract.
      escrow = new ethers.Contract(escrowAddress, abi, wallet);
    } else {
      // Deploy a new contract.
      const factory = new ethers.ContractFactory(abi, bytecode, wallet);
      const deployed = await factory.deploy();
      await deployed.waitForDeployment();
      escrowAddress = await deployed.getAddress();
      escrow = deployed;
    }

    // Build the parallel arrays required by createSplit.
    const froms = transfers.map((t) => t.fromAddress);
    const tos = transfers.map((t) => t.toAddress);
    const amounts = transfers.map((t) => t.amountWei);

    // The signature differs between contracts: the native one takes no token.
    const tx = native
      ? await escrow.createSplit(froms, tos, amounts, durationSeconds)
      : await escrow.createSplit(tokenAddress, froms, tos, amounts, durationSeconds);
    const receipt = await tx.wait();

    // Extract the splitId from the SplitCreated event.
    let splitId = 0;
    for (const log of receipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "SplitCreated") {
          splitId = Number(parsed.args.splitId);
          break;
        }
      } catch (_) {
        // log from another contract — ignore
      }
    }

    return {
      escrowAddress,
      splitId,
      txHash: receipt.hash,
      abi,
    };
  } catch (err) {
    throw new Error(`escrow-deployer failed: ${err.message}`);
  }
}
