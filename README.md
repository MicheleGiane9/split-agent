# Split Agent 🤝⛓️

> **Autonomous on-chain bill-splitting agent (Splitwise on-chain) built for the Pharos Network — _Skill-to-Agent Dual Cascade Hackathon_.**

Split Agent takes a plain-English (or Portuguese) sentence such as
_"John, Ann and Pete went to the bar, John paid 6, Ann paid nothing, Pete paid nothing"_,
automatically figures out **who owes whom and how much**, deploys an **escrow** smart contract on
Pharos, **charges every participant automatically** (in the spirit of the **x402** protocol),
**settles** all payments on-chain, and writes an **immutable record** of the settlement.

---

## 🎯 The problem it solves

Splitting shared expenses is a universal headache. Apps like Splitwise:

- Only **track** balances — they never move the money. You still chase each person to pay you back.
- Are **centralized and trust-based** — no guarantee, no escrow, no proof of settlement.
- Don't talk to **money rails** — settling means a separate manual transfer.

**Split Agent closes the loop.** It calculates the debts, escrows the funds, collects from every
debtor automatically, settles to every creditor on-chain, and leaves a tamper-proof receipt. One
sentence in → fully settled on-chain. A natural fit for Pharos: a fast EVM Layer-1 with native
support for the **x402** machine-to-machine micropayment protocol.

---

## ✨ What the agent does

1. Parses the participants and how much each one spent (natural language).
2. Computes the split while **minimizing the number of transfers**.
3. Deploys an escrow smart contract to guarantee payment.
4. Charges each participant automatically via their wallet (x402 style).
5. Settles all payments on-chain (native PHRS or USDC).
6. Writes an immutable record of the transaction to the blockchain.
7. Reports the final status for every participant.

---

## 🧩 Architecture — Skills (Phase 1) + Agent (Phase 2)

The project follows the hackathon's **Skill-to-Agent Dual Cascade** model: reusable, standalone
**Skills** in Phase 1, composed into a full autonomous **Agent** in Phase 2.

Each Skill is an independent, reusable module (`skill.js` + `skill.json` + `README.md`):

| # | Skill | Function | What it does |
|---|-------|----------|--------------|
| 1 | **split-calculator** | `calculateSplit` | Greedy minimal-transaction split algorithm |
| 2 | **escrow-deployer** | `deployEscrowAndCreateSplit` | Compiles/deploys the escrow and creates the group on-chain |
| 3 | **auto-pay** | `executePayments` | x402-style automatic payments with balance check + retry/backoff |
| 4 | **settlement-ledger** | `settleAndRecord` / `queryHistory` | Settles and records the immutable result on-chain |

The cascade:

```
natural language → split-calculator → escrow-deployer → auto-pay → settlement-ledger
```

### Two ways to run

- **One-shot orchestration** (`agent.js`): runs the full cascade in a single command.
- **Autonomous mode** (`watcher.js`): a long-running agent that watches the escrow contract and calls
  `settle()` **by itself** when a group is fully paid — no human trigger.

---

## 📁 Project structure

```
split-agent/
├── contracts/
│   ├── SplitEscrow.sol          # ERC-20 (USDC) escrow
│   └── SplitEscrowNative.sol    # native PHRS escrow
├── lib/
│   ├── compile.js               # solc compilation + ERC-20 ABI
│   ├── parser.js                # bilingual natural-language parser (EN/PT)
│   └── wallets.js               # participant wallet resolution
├── skills/
│   ├── split-calculator/        # Skill 1
│   ├── escrow-deployer/         # Skill 2
│   ├── auto-pay/                # Skill 3
│   └── settlement-ledger/       # Skill 4
├── agent.js                     # orchestrator agent
├── watcher.js                   # autonomous mode: auto-settles on-chain
├── deploy.js                    # deploy & smoke test on testnet
├── demo/demo.mp4                # end-to-end demo video
├── .env.example
├── package.json
└── README.md
```

---

## 🔍 The escrow contracts

A deliberately small, auditable escrow (two flavors, same interface idea):

- `createSplit(...)` — creates a group of debt obligations; emits `SplitCreated`.
- `deposit(splitId, debtIndex)` — a debtor pays their share (native: sends `msg.value`; ERC-20: `transferFrom` after `approve`); emits `Deposited`.
- `settle(splitId)` — once everyone has paid, pays each creditor what they're owed; emits `Settled`.
- View helpers: `getDebtCount`, `getDebt`, `isFullyPaid`.

It sets `settled = true` **before** transfers (reentrancy protection) and uses custom errors to keep
gas low. The three events form the **immutable ledger** that `settlement-ledger → queryHistory` reads.

---

## 🔗 Live deployment proof (Pharos Atlantic testnet)

Split Agent is **not just code — it runs live on Pharos Atlantic** (chain ID `688689`), settling real
on-chain transfers in native **PHRS**.

| Item | Value |
|------|-------|
| Network | Pharos Atlantic testnet (chain `688689`) |
| Escrow contract | [`0x51d45286653Ca652BE5087B5f127304bc9b93A2A`](https://atlantic.pharosscan.xyz/address/0x51d45286653Ca652BE5087B5f127304bc9b93A2A) |
| Explorer | https://atlantic.pharosscan.xyz/ |

**Autonomous settlement** — the watcher detected a fully-paid group and called `settle()` by itself,
paying the creditor 4 PHRS with no human trigger:

- Group #7 auto-settlement tx: [`0x3b56425814d4200cf611b84f5f5a7a641f259a80cd708ab8bdf453c6019fc33f`](https://atlantic.pharosscan.xyz/tx/0x3b56425814d4200cf611b84f5f5a7a641f259a80cd708ab8bdf453c6019fc33f)
- Group #6 auto-settlement tx: [`0x1d7cac10cc55e5d93439ac141756db42df4e7ace6784274355605380c5319d83`](https://atlantic.pharosscan.xyz/tx/0x1d7cac10cc55e5d93439ac141756db42df4e7ace6784274355605380c5319d83)

**Automatic payments (x402-style)** — the agent charged each debtor on their behalf:

- Ann → escrow: [`0x28237c1df8d190b5466ad331848af64f427de1f2558508befb124d16bde83bf4`](https://atlantic.pharosscan.xyz/tx/0x28237c1df8d190b5466ad331848af64f427de1f2558508befb124d16bde83bf4)
- Pete → escrow: [`0xcb52639e6a58b0c5946e518f7c9e2341f8d88483172fafc7605442b6a30ad044`](https://atlantic.pharosscan.xyz/tx/0xcb52639e6a58b0c5946e518f7c9e2341f8d88483172fafc7605442b6a30ad044)

Every step emits an immutable event (`SplitCreated`, `Deposited`, `Settled`) that anyone can verify on
the explorer.

---

## 💱 Payment mode: native PHRS or USDC

Selected by `PAYMENT_MODE` in `.env`:

- **`native` (default)** — settles in the chain's native coin **PHRS** (`SplitEscrowNative.sol`). No
  ERC-20 needed; ideal on testnet where PHRS is easy to get from a faucet. Amounts are in PHRS (18
  decimals) — use **small values** (e.g. `0.02`), since faucets only hand out fractions of a PHRS.
- **`erc20`** — settles in the test **USDC** token (`USDC_ADDRESS`), using `SplitEscrow.sol`.

---

## 🛠️ Installation

Prerequisite: **Node.js 18+**.

```bash
git clone <your-repo> split-agent
cd split-agent
npm install
cp .env.example .env
```

```ini
PHAROS_RPC_URL=https://atlantic.dplabs-internal.com
PHAROS_CHAIN_ID=688689
PRIVATE_KEY=0xYOUR_AGENT_PRIVATE_KEY
PAYMENT_MODE=native
ESCROW_ADDRESS=
# Payer (debtor) wallets — names must match the sentence:
PARTICIPANT_KEYS=Ann:0x...,Pete:0x...
```

> Get test PHRS from the Pharos Atlantic faucet ([testnet.pharosnetwork.xyz](https://testnet.pharosnetwork.xyz/)).
> Only the **agent** and the **payers** need PHRS; people who only receive need no funds and no key.

---

## 🚀 How to run

### 1. Deploy the contract

```bash
npm run deploy
```

Copy the printed `ESCROW_ADDRESS` into your `.env` (optional — the agent can also deploy a fresh one).

### 2. Run the agent (one-shot)

```bash
node agent.js "John, Ann and Pete went to the bar, John paid 6, Ann paid nothing, Pete paid nothing"
```

In native mode, amounts are real PHRS — keep them small (each debtor needs the amount + gas).

### 3. Autonomous mode (the agent settles on its own) 🤖

This is what makes Split Agent a true agent. A long-running watcher **watches the escrow contract** and
calls `settle()` **by itself** the moment a group becomes fully paid — no human in the loop.

**Terminal A** (needs `ESCROW_ADDRESS` set):

```bash
npm run watch
```

**Terminal B** — create and pay a group, deferring settlement to the watcher:

```bash
node agent.js --no-settle "John, Ann and Pete went to the bar, John paid 6, Ann paid nothing, Pete paid nothing"
```

As the deposits land on-chain, terminal A detects the group is fully paid and autonomously fires
`settle()` — printing `🎉 Group X settled on its own!`. It uses lightweight polling, so it works on
RPCs that don't support live event filters.

### 4. Test just the calculator (no blockchain needed)

```bash
npm run test:calc
```

Expected output:

```
Total spent: 200
Per person:  50
Required transfers:
  Ann -> John: 50
  Pete -> Mary: 10
```

---

## 🧪 Verification

Each skill can be imported in isolation:

```js
import { calculateSplit } from "./skills/split-calculator/skill.js";
calculateSplit([{ name: "Ann", paid: 0 }, { name: "Bea", paid: 100 }]);
```

---

## 🎬 Demo

End-to-end demo video: **[`demo/demo.mp4`](./demo/demo.mp4)**.

It shows the full flow live on Pharos Atlantic — the agent parsing a sentence, computing the split,
creating the on-chain group, auto-paying each debtor, and the autonomous watcher settling the group by
itself (`🎉 Group settled on its own!`).

---

## ⚙️ Tech stack

- **ethers.js v6** — blockchain interaction
- **solc** — Solidity compilation
- **dotenv** — environment variables
- **Solidity ^0.8.20** — `SplitEscrow.sol` (ERC-20) and `SplitEscrowNative.sol` (native PHRS)
- No unnecessary dependencies.

---

## 📝 License

MIT.
