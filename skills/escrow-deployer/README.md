# Skill: escrow-deployer

Deploys the escrow contract on Pharos (or reuses an existing one) and creates an on-chain split group. Supports native PHRS and ERC-20 (USDC).

## What it does

1. Compiles the right contract (`SplitEscrowNative.sol` for native PHRS, `SplitEscrow.sol` for USDC).
2. If `escrowAddress` is provided, reuses the contract; otherwise deploys a new one.
3. Calls `createSplit(...)` with the list of debts (who owes whom).
4. Reads the `SplitCreated` event and returns the `splitId`.

## Input

```js
{
  wallet,                         // ethers.Wallet (agent signer)
  transfers: [
    { fromAddress: "0xAnn...",  toAddress: "0xJohn...", amountWei: 2000000000000000000n },
    { fromAddress: "0xPete...", toAddress: "0xJohn...", amountWei: 2000000000000000000n }
  ],
  durationSeconds: 86400,         // optional (24h)
  native: true                    // native PHRS mode
}
```

## Output

```js
{
  escrowAddress: "0x...",
  splitId: 0,
  txHash: "0x...",
  abi: [ /* contract ABI */ ]
}
```

## Usage

```js
import { deployEscrowAndCreateSplit } from "./skill.js";

const res = await deployEscrowAndCreateSplit({ wallet, transfers, native: true });
console.log("Group created:", res.splitId, "in contract", res.escrowAddress);
```
