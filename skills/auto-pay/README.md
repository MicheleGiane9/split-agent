# Skill: auto-pay

Executes automatic payments from each debtor into the escrow, in the spirit of Pharos's **x402** protocol (machine-to-machine payments). Supports native PHRS and USDC.

## What it does

For each debt:

1. **Checks the balance** of the debtor before paying.
2. **(ERC-20 only) approves** the escrow if needed.
3. **Deposits** the amount: native mode sends `msg.value`; ERC-20 mode uses `transferFrom`.
4. **Automatic retry** with exponential backoff (1s, 2s, 4s) on transient failures. Insufficient balance aborts the job without useless retries.

## Input

```js
{
  escrowAddress: "0x...",
  escrowAbi: [ /* ABI */ ],
  splitId: 0,
  native: true,
  jobs: [
    { debtIndex: 0, signer: walletAnn,  amountWei: 2000000000000000000n, fromName: "Ann" },
    { debtIndex: 1, signer: walletPete, amountWei: 2000000000000000000n, fromName: "Pete" }
  ],
  maxRetries: 3
}
```

## Output

```js
{
  allPaid: true,
  results: [
    { fromName: "Ann",  success: true, txHash: "0x...", attempts: 1 },
    { fromName: "Pete", success: true, txHash: "0x...", attempts: 1 }
  ]
}
```

## About x402

Pharos's x402 lets autonomous agents pay for resources/services machine-to-machine.
This skill applies the same principle: the agent, on behalf of each debtor (or via an
authorized x402 endpoint), executes the charge with no human intervention, always
validating funds before charging.
