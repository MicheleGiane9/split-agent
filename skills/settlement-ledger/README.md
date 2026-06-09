# Skill: settlement-ledger

Settles the group on-chain, records an immutable result and lets you query the history.

## What it does

`settleAndRecord(...)`:

1. Checks the group is fully paid (`isFullyPaid`).
2. Calls `settle()` on the contract — each creditor receives what they're owed.
3. Reads the `Settled` event (total amount, timestamp).
4. Writes a local JSON record (append-only) with group, amounts, timestamp and tx hash.

`queryHistory(...)`:

- Reads all `Settled` events straight from the blockchain and returns the public history.

## Input (settleAndRecord)

```js
{
  escrowAddress: "0x...",
  escrowAbi: [ /* ABI */ ],
  wallet,                 // agent signer
  splitId: 0,
  meta: { group: "Bar with friends", transfers: [...] },
  ledgerPath: "./ledger.json"
}
```

## Output

```js
{
  group: "Bar with friends",
  splitId: 0,
  txHash: "0x...",
  totalTransferred: "4000000000000000000",
  timestamp: 1749481200,
  isoDate: "2026-06-09T15:00:00.000Z"
}
```

## Query history

```js
import { queryHistory } from "./skill.js";

const history = await queryHistory({ escrowAddress, escrowAbi, provider });
console.log(history);
```
