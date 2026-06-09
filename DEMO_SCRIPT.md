# 🎬 Split Agent — Demo Video Script (English)

**Target length:** ~2 min 30 s · **Format:** screen recording + voice-over
**Goal:** show international judges the problem, the 4 skills, and a real on-chain settlement on Pharos.

> Tip: record at 1080p, keep your terminal font large, and have a block explorer tab ready
> (Pharos Atlantic) so you can click through to the deployed contract and the `Settled` event.

---

## 0 · Cold open (0:00 – 0:15)

**On screen:** title card "Split Agent — autonomous bill-splitting on Pharos".

> "This is Split Agent. You tell it, in plain English, who paid what at dinner — and it settles
> everyone up on-chain, automatically. No chasing friends for money, no manual transfers. Let me
> show you."

---

## 1 · The problem (0:15 – 0:35)

**On screen:** a Splitwise-style screenshot, or just a bulleted slide.

> "Apps like Splitwise only *track* who owes whom — they never actually move the money. They're
> centralized, trust-based, and disconnected from any payment rail. Split Agent closes the loop:
> it calculates the debts, escrows the funds, charges every debtor, and settles to every creditor
> on-chain — with an immutable receipt."

---

## 2 · Architecture: Skills → Agent (0:35 – 1:00)

**On screen:** the flow diagram from the README (skills cascade).

> "It's built the way this hackathon asks for: four reusable Skills in Phase 1, composed into one
> autonomous Agent in Phase 2. Skill one, split-calculator, computes the minimal set of transfers.
> Skill two, escrow-deployer, deploys the escrow contract and creates the group on-chain. Skill
> three, auto-pay, charges each participant in the spirit of the x402 protocol — checking balances
> and retrying on failure. Skill four, settlement-ledger, settles and records an immutable result."

---

## 3 · The calculator skill, standalone (1:00 – 1:20)

**On screen:** terminal — run the pure-logic skill.

```bash
npm run test:calc
```

> "Each skill works on its own. Here's split-calculator with no blockchain at all: four people, two
> hundred total, fifty each. Notice it produces just two transfers — Ana pays João fifty, Pedro pays
> Maria ten — instead of everyone paying everyone. That's the minimal-transaction algorithm."

---

## 4 · Deploy the contract (1:20 – 1:45)

**On screen:** terminal.

```bash
npm run deploy
```

> "Now I deploy the SplitEscrow contract to Pharos Atlantic, chain ID 688689. It compiles the
> Solidity, deploys it, and runs a smoke test that creates a sample group and reads it back. There's
> our contract address."

**Action:** copy the printed address → paste into the block explorer → show the contract.

---

## 5 · The autonomous agent in action (1:45 – 2:25)

> This is the money shot — show two terminals side by side.

**On screen — Terminal A (the autonomous agent):**

```bash
npm run watch
```

> "Now the key part. In this terminal I start the autonomous agent. It just sits there, listening to
> the escrow contract on Pharos. Nobody is driving it."

**On screen — Terminal B (creates and pays the group, but defers settlement):**

```bash
node agent.js --no-settle "We were 4 at the restaurant, João paid 100, Maria paid 60, Pedro paid 40, Ana paid nothing"
```

> "Over here, the agent parses the sentence, calculates the split, creates the group on-chain, and
> auto-pays each debtor — checking balances, approving, depositing, retrying on failure. But notice:
> it does *not* settle. It hands that off."

**On screen:** switch focus to Terminal A as the deposits land.

> "Watch terminal A. As each deposit hits the chain, the agent reacts to the `Deposited` event. The
> moment the group is fully paid, it decides — on its own — to call settle. There it goes:
> 'Group settled on its own.' No human pressed anything. That's an agent."

---

## 6 · Proof on-chain (2:25 – 2:40)

**On screen:** block explorer — open the settlement transaction and expand logs.

> "And here's the proof: the Settled event on Pharos, with the group, the total transferred, and the
> timestamp — an immutable receipt anyone can verify. From one English sentence to an autonomously
> settled, on-chain split. That's Split Agent. Thanks for watching."

**On screen:** end card with the GitHub repo URL.

---

### Alternative (shorter) cut — one-shot mode

If you prefer a tighter 2-minute video, replace scene 5 with the single-command run and skip the
two-terminal setup:

```bash
node agent.js "We were 4 at the restaurant, João paid 100, Maria paid 60, Pedro paid 40, Ana paid nothing"
```

> "And here's the whole thing in one command — parse, calculate, deploy, auto-pay, and settle, end to
> end." (Then go straight to scene 6.) Mention that an autonomous `npm run watch` mode also exists.

---

## 📋 Pre-recording checklist

- [ ] `.env` filled with a funded `PRIVATE_KEY` and valid `PARTICIPANT_KEYS` (each test wallet holds enough test USDC + a little PHRS for gas).
- [ ] Test USDC obtained for every participant wallet that will pay.
- [ ] A successful dry run completed before recording.
- [ ] `ESCROW_ADDRESS` set in `.env` (from `npm run deploy`) so `npm run watch` works.
- [ ] Two terminals arranged side by side for the autonomous-mode scene.
- [ ] Block explorer tab open on Pharos Atlantic.
- [ ] Terminal font size increased for readability.
- [ ] GitHub repo is public and the URL is ready for the end card.

## 🗣️ One-line pitch (for the DoraHacks description field)

> Split Agent turns a plain-English sentence about who-paid-what into a fully settled, on-chain
> bill split on Pharos — escrowed, auto-charged via x402, and recorded immutably. Four reusable
> skills, one autonomous agent.
