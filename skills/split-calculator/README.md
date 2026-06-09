# Skill: split-calculator

Computes who should pay whom, minimizing the number of transfers.

## What it does

Given a list of participants and how much each one paid, the skill:

1. Computes the total spend and the equal per-person share.
2. Determines each participant's balance (positive = is owed, negative = owes).
3. Applies a greedy algorithm that matches the biggest debtor with the biggest creditor, producing the smallest practical number of transfers.

## Input

```js
[
  { name: "John", paid: 100 },
  { name: "Mary", paid: 60 },
  { name: "Pete", paid: 40 },
  { name: "Ann",  paid: 0 }
]
```

## Output

```js
{
  total: 200,
  perPerson: 50,
  balances: { "John": 50, "Mary": 10, "Pete": -10, "Ann": -50 },
  transfers: [
    { from: "Ann",  to: "John", amount: 50 },
    { from: "Pete", to: "Mary", amount: 10 }
  ]
}
```

## Usage

```js
import { calculateSplit } from "./skill.js";

const result = calculateSplit(participants);
console.log(result.transfers);
```

## Quick test

```bash
node skills/split-calculator/skill.js
```
