/**
 * Skill: split-calculator
 * ------------------------------------------------------------------
 * Given how much each participant spent, computes the minimal list of
 * transfers (who pays whom and how much) to balance the group.
 *
 * Uses a greedy "transaction minimization" algorithm:
 *   1. Compute the average spend (total / number of people).
 *   2. Whoever spent above the average is a creditor; below, a debtor.
 *   3. Repeatedly match the biggest debtor with the biggest creditor.
 *
 * It does not minimize absolutely optimally (NP-hard problem), but it
 * produces a transaction count close to optimal and far smaller than
 * "everyone pays everyone".
 * ------------------------------------------------------------------
 */

/**
 * @typedef {Object} Participant
 * @property {string} name    Participant name.
 * @property {number} paid    How much the person actually paid.
 * @property {string} [address] Wallet address (optional, passed through to output).
 */

/**
 * @typedef {Object} Transfer
 * @property {string} from    Who pays.
 * @property {string} to      Who receives.
 * @property {number} amount  Amount (rounded to 2 decimals).
 */

/**
 * Compute the transfers needed to balance the spending.
 *
 * @param {Participant[]} participants List of participants and what they paid.
 * @returns {{ transfers: Transfer[], perPerson: number, total: number, balances: Object }}
 */
export function calculateSplit(participants) {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error("split-calculator: the participant list is empty.");
  }

  // Total and per-person share (equal split of the total spend).
  const total = participants.reduce((acc, p) => acc + Number(p.paid || 0), 0);
  const perPerson = total / participants.length;

  // Balance per person: positive = is owed money; negative = must pay.
  // balance = amount paid - amount they should have paid
  const balances = {};
  const creditors = []; // { name, amount } with amount > 0
  const debtors = [];   // { name, amount } with amount > 0 (amount owed)

  for (const p of participants) {
    const balance = round(Number(p.paid || 0) - perPerson);
    balances[p.name] = balance;
    if (balance > 0) {
      creditors.push({ name: p.name, amount: balance });
    } else if (balance < 0) {
      debtors.push({ name: p.name, amount: -balance });
    }
  }

  // Sort from largest to smallest to match big amounts first.
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0; // debtor pointer
  let j = 0; // creditor pointer

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    // The amount transferable this round is the smaller of the two balances.
    const amount = round(Math.min(debtor.amount, creditor.amount));

    if (amount > 0) {
      transfers.push({ from: debtor.name, to: creditor.name, amount });
    }

    debtor.amount = round(debtor.amount - amount);
    creditor.amount = round(creditor.amount - amount);

    // Advance the pointer of whoever reached zero (with float tolerance).
    if (debtor.amount <= 0.005) i++;
    if (creditor.amount <= 0.005) j++;
  }

  return {
    transfers,
    perPerson: round(perPerson),
    total: round(total),
    balances,
  };
}

/** Round to 2 decimals, avoiding floating-point errors. */
function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ------------------------------------------------------------------
// Direct execution for a quick test: `node skills/split-calculator/skill.js`
// (the pathToFileURL comparison works on Windows and Linux)
// ------------------------------------------------------------------
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const example = [
    { name: "John", paid: 100 },
    { name: "Mary", paid: 60 },
    { name: "Pete", paid: 40 },
    { name: "Ann", paid: 0 },
  ];

  const result = calculateSplit(example);
  console.log("=== split-calculator (test) ===");
  console.log(`Total spent: ${result.total}`);
  console.log(`Per person:  ${result.perPerson}`);
  console.log("Balances:", result.balances);
  console.log("Required transfers:");
  for (const t of result.transfers) {
    console.log(`  ${t.from} -> ${t.to}: ${t.amount}`);
  }
}
