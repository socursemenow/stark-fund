# ⚡ StarkFund — Gasless Micro-Fundraising on Starknet

> Fund the next big idea. One tap. Zero gas. Built with [Starkzap SDK](https://docs.starknet.io/build/starkzap/overview).

**StarkFund** is a gasless micro-fundraising platform on Starknet. Founders post startup ideas with a STRK funding goal. Backers contribute in one tap. All transactions are gasless via Cartridge Controller. Funds are held in escrow until the goal is met — if not, backers get automatic refunds.

Built for the **Starkzap Developer Bounty Challenge V2** ($3,000 pool).

🔗 **Live Demo:** [stark-fund.vercel.app](https://stark-fund.vercel.app)
📦 **Repo:** [github.com/socursemenow/stark-fund](https://github.com/socursemenow/stark-fund)

---

## 🎬 How It Works

```
1. Sign In     → Google, Twitter, or passkeys (Cartridge Controller)
2. Create      → Post your idea + pay 10 STRK launch fee
3. Fund        → Backers contribute STRK, ETH, or USDC (auto-swap)
4. Goal Met?   → Founder withdraws (minus 1.5% platform fee)
5. Goal Missed → All backers auto-refunded via batch transaction
```

---

## 🔧 Starkzap SDK Integration (14+ modules)

This project deeply integrates the Starkzap SDK across every user-facing feature:

| SDK Module | Where Used | How |
|---|---|---|
| `sdk.onboard()` | `useWallet.js` | Social login via `OnboardStrategy.Cartridge` with session policies |
| `wallet.transfer()` | `useWallet.js` | Fund campaigns, pay launch fee, vote proof tx, batch refunds |
| `wallet.swap()` | `SwapModal.jsx`, `useWallet.js` | Token swaps via AVNU + Ekubo, pay-with-USDC/ETH flow |
| `wallet.getQuote()` | `SwapModal.jsx`, `FundModal.jsx` | Live swap rates with provider fallback |
| `wallet.balanceOf()` | `WalletPanel.jsx`, `SwapModal.jsx` | Real-time STRK/ETH/USDC balance display |
| `wallet.enterPool()` | `StakeModal.jsx` | STRK staking with validator pool discovery |
| `sdk.stakingTokens()` | `StakeModal.jsx` | Discover stakeable tokens on current network |
| `sdk.getStakerPools()` | `StakeModal.jsx` | Find validator pools for delegation |
| `wallet.registerSwapProvider()` | `useWallet.js` | Register AVNU + Ekubo after onboarding |
| `Amount.parse()` | `useWallet.js` | Safe token amount formatting for all transfers |
| `fromAddress()` | `useWallet.js` | Address formatting for SDK transfer recipients |
| `getPresets()` / token presets | `useStarkzap.js` | Network-aware STRK/ETH/USDC token metadata |
| Cartridge Controller | Built-in | Gasless paymaster for all transactions |
| Batch `wallet.transfer()` | `VoteRefund.jsx` | Multi-recipient refund in single tx |

### SDK Code Patterns Used

**Onboarding with Cartridge Controller + session policies:**
```js
const onboard = await sdk.onboard({
  strategy: OnboardStrategy.Cartridge,
  cartridge: {
    policies: [
      { target: STRK_ADDRESS, method: "transfer" },
      { target: STRK_ADDRESS, method: "approve" },
    ],
  },
});
const wallet = onboard.wallet;
wallet.registerSwapProvider(new AvnuSwapProvider());
wallet.registerSwapProvider(new EkuboSwapProvider());
```

**Batch transfer (refund all backers in 1 tx):**
```js
const tx = await wallet.transfer(STRK, [
  { to: fromAddress(backer1), amount: Amount.parse("50", STRK) },
  { to: fromAddress(backer2), amount: Amount.parse("30", STRK) },
]);
await tx.wait();
```

**Swap + transfer (pay with any token):**
```js
const swapTx = await wallet.swap(
  { tokenIn: USDC, tokenOut: STRK, amountIn, slippageBps: 100n },
  { feeMode: "sponsored" }
);
await swapTx.wait();
const transferTx = await wallet.transfer(STRK, [{ to, amount }]);
await transferTx.wait();
```

---

## ✨ Features

### Core
- **Social login** — Google, Twitter, passkeys via Cartridge Controller
- **Gasless everything** — Cartridge paymaster sponsors all transactions
- **Escrow model** — All funds held by platform wallet until goal is met
- **Multi-token funding** — Pay with STRK, ETH, or USDC (auto-swap via AVNU/Ekubo)
- **10 STRK launch fee** — Anti-spam + platform revenue (real on-chain transfer)
- **1.5% platform fee** — Deducted on release, stays in platform wallet

### Safety
- **Backer voting** — >50% vote triggers early refund (1 vote per backer, on-chain proof)
- **Auto-refund** — Server cron detects expired campaigns and batch-refunds backers
- **Founder-initiated refund** — Red button to refund all backers at any time
- **Overfund protection** — Contributions capped to remaining goal
- **Deadline enforcement** — Server rejects funding after deadline passes
- **Duplicate tx protection** — Server deduplicates by tx_hash

### DeFi
- **Token swap** — Standalone swap interface (STRK ↔ ETH ↔ USDC) with live balances
- **STRK staking** — Stake into validator pools with APY display
- **Live quotes** — Real-time swap rates with price impact

### UX
- **Dashboard** — Active / Completed / Expired / Activity tabs with tx links
- **Share** — Twitter, Telegram, copy link
- **Campaign socials** — Required Twitter, Discord, Telegram links
- **Voyager links** — Every transaction links to block explorer
- **Error recovery** — ErrorBoundary + graceful API fallback

---

## 💰 Revenue Model

```
Platform Revenue:
├── 10 STRK per campaign launch (anti-spam + revenue)
├── 1.5% fee on every successful withdrawal
└── Future: staking revenue share, featured campaigns, premium tiers
```

---

## 🔗 On-Chain Deployments

### Mainnet (Production) ✅

| Item | Value |
|---|---|
| **Contract Address** | [`0x06cae3abfe0d25d642cf3623f29c05c53ebbd044e3ae6c33e0f1969151208a03`](https://voyager.online/contract/0x06cae3abfe0d25d642cf3623f29c05c53ebbd044e3ae6c33e0f1969151208a03) |
| **Class Hash** | `0x004abc63466c43e6494e0b32d6add0e069a0c2fe9d7fc576b2582fbca493e702` |
| **Declare Tx** | [`0x052de2dabff9bcc385f71ecba7e7f276f77582cfc55e973b83c2b74ac2639145`](https://voyager.online/tx/0x052de2dabff9bcc385f71ecba7e7f276f77582cfc55e973b83c2b74ac2639145) |
| **Deploy Tx** | [`0x0073ba993eeec5b2289d1597e6ff0b3d85602e2e61fdb24cab408cd52e075479`](https://voyager.online/tx/0x0073ba993eeec5b2289d1597e6ff0b3d85602e2e61fdb24cab408cd52e075479) |
| **Platform Wallet** | `0x044BD49fECCF32fbb0Be03995Fd0167F28A54F3662F61BF9c9c106547109DDC9` |
| **Platform Fee** | 150 bps (1.5%) |

### Sepolia (Testnet)

| Item | Value |
|---|---|
| **Contract Address** | [`0x02e0a03380ae53ff6827dfc3727640ceb349b244dc2a2389a6baabe03a89395c`](https://sepolia.voyager.online/contract/0x02e0a03380ae53ff6827dfc3727640ceb349b244dc2a2389a6baabe03a89395c) |
| **Declare Tx** | [`0x076c87c34fafb623c763f7de8f76ccd112808bf8c4623c59e140d3118e29d058`](https://sepolia.voyager.online/tx/0x076c87c34fafb623c763f7de8f76ccd112808bf8c4623c59e140d3118e29d058) |
| **Deploy Tx** | [`0x063d6626d10388e7c19a67cf45ce14e01c0d8cc6bcdf3043ce0f9365ce6ae359`](https://sepolia.voyager.online/tx/0x063d6626d10388e7c19a67cf45ce14e01c0d8cc6bcdf3043ce0f9365ce6ae359) |

---

## 🏗️ Architecture

```
starkfund/
├── contracts/                    # Cairo 2.16.1 escrow contract (deployed on mainnet + sepolia)
│   ├── Scarb.toml
│   └── src/
│       ├── lib.cairo
│       └── starkfund_escrow.cairo
├── server/                       # Express.js backend
│   ├── package.json
│   ├── index.js                  # API + Supabase + escrow release/refund/vote
│   └── refund-cron.js            # Hourly auto-refund for expired campaigns
├── src/
│   ├── main.jsx                  # Entry + BrowserRouter + Toaster
│   ├── App.jsx                   # Cartridge auth + routing
│   ├── index.css                 # Tailwind + Starknet orange theme
│   ├── hooks/
│   │   ├── useStarkzap.js        # SDK singleton + token presets + helpers
│   │   ├── useWallet.js          # Zustand store + ALL SDK wallet actions
│   │   ├── useCampaigns.js       # Campaign CRUD (API + local fallback)
│   │   └── useAutoRefund.js      # Auto-detect expired + trigger refund
│   ├── lib/
│   │   └── api.js                # Backend API wrapper
│   ├── pages/
│   │   ├── Landing.jsx           # Hero + How It Works + stats
│   │   ├── Explore.jsx           # Campaign grid + filters + WalletPanel
│   │   ├── Campaign.jsx          # Detail + fund + vote + share + tx links
│   │   └── Dashboard.jsx         # Active/Completed/Expired/Activity with tx links
│   └── components/
│       ├── Navbar.jsx             # Logo + Dashboard + wallet display
│       ├── CampaignCard.jsx       # Grid card with progress bar
│       ├── WalletPanel.jsx        # Balance + Stake + Swap buttons
│       ├── FundModal.jsx          # Fund with STRK/ETH/USDC + escrow
│       ├── StakeModal.jsx         # STRK staking + pool discovery
│       ├── SwapModal.jsx          # Token swap + live quotes + balances
│       ├── CreateModal.jsx        # Campaign creation + 10 STRK fee
│       ├── FounderPanel.jsx       # Withdraw / Stake / Refund (persistent state)
│       ├── VoteRefund.jsx         # Backer voting + batch refund
│       ├── ShareCampaign.jsx      # Twitter + Telegram + copy link
│       └── ErrorBoundary.jsx      # Crash recovery UI
```

### Fund Flow (Escrow Model)

```
Backer funds campaign:
  └→ wallet.transfer(STRK) → PLATFORM_WALLET (escrow)
  └→ Server records contribution in Supabase

Goal met → Founder clicks "Withdraw":
  └→ Server validates goal + founder identity
  └→ platformAccount.transfer() sends (raised - 1.5% fee) to founder
  └→ 1.5% fee stays in platform wallet

Deadline missed → Auto-refund:
  └→ Cron detects expired campaigns hourly
  └→ platformAccount.execute() batch refund (all backers in 1 tx)
  └→ Each backer gets their exact contribution back

Vote-triggered refund:
  └→ Backers send 0.001 STRK proof tx + server records vote
  └→ >50% threshold → batch refund executes on-chain
  └→ All votes cleared for fresh round if re-funded
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm

### 1. Clone & Install

```bash
git clone https://github.com/socursemenow/stark-fund.git
cd stark-fund
npm install
cd server && npm install && cd ..
```

### 2. Environment Setup

**Root `.env`:**
```
VITE_NETWORK=mainnet
VITE_API_URL=http://localhost:3001
VITE_PLATFORM_WALLET=0x044BD49fECCF32fbb0Be03995Fd0167F28A54F3662F61BF9c9c106547109DDC9
VITE_ESCROW_CONTRACT=0x06cae3abfe0d25d642cf3623f29c05c53ebbd044e3ae6c33e0f1969151208a03
```

**`server/.env`:**
```
PORT=3001
NETWORK=mainnet
PLATFORM_WALLET=0x044BD49fECCF32fbb0Be03995Fd0167F28A54F3662F61BF9c9c106547109DDC9
FRONTEND_URL=http://localhost:5173
ESCROW_CONTRACT=0x06cae3abfe0d25d642cf3623f29c05c53ebbd044e3ae6c33e0f1969151208a03
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Run

```bash
# Terminal 1: Backend
cd server && node index.js

# Terminal 2: Frontend
npm run dev
```

Open `http://localhost:5173` → Sign in → Create or fund a campaign.

---

## 📜 Cairo Smart Contract (Deployed on Mainnet + Sepolia ✅)

The `contracts/` directory contains a full Cairo escrow contract with:

- `create_campaign()` — register campaign with goal + deadline + token
- `contribute()` — backer deposits to escrow (ERC20 transferFrom)
- `withdraw()` — founder claims funds (minus platform fee) after goal met
- `refund()` — mark campaign refundable (deadline passed or vote threshold)
- `claim_refund()` — individual backer claims their refund
- `vote_refund()` — backer votes for early refund (1 vote per backer)
- Full OpenZeppelin ERC20 integration

```bash
cd contracts
scarb build
# Declare + Deploy on mainnet or sepolia
starkli declare <contract_class.json> --casm-hash <casm_hash> --keystore <keystore> --account <account> --rpc <rpc_url>
starkli deploy <class_hash> <platform_wallet> 150 --keystore <keystore> --account <account> --rpc <rpc_url>
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8 + Tailwind CSS v4 |
| Auth | Cartridge Controller (social login + passkeys + gasless) |
| SDK | Starkzap v2 (`starkzap` npm package) |
| Swap | AVNU (aggregator) + Ekubo (AMM) |
| State | Zustand |
| Backend | Express.js + Supabase PostgreSQL |
| Blockchain | Starknet Mainnet |
| Smart Contract | Cairo 2.16.1 + OpenZeppelin v1.0.0 |
| Deployment | Vercel (frontend) + Render (backend) |

---

## 🗺️ Roadmap

### ✅ V1 (Current — Bounty Submission)
- Cartridge Controller social login
- Gasless transactions on mainnet
- Campaign CRUD with 10 STRK launch fee
- Fund with STRK/ETH/USDC (auto-swap via AVNU/Ekubo)
- Escrow model (platform wallet)
- 1.5% platform fee on release
- Persistent withdraw state
- Backer voting for early refund (votes reset on refund)
- Auto-refund cron for expired campaigns
- Batch refund in single tx
- Token swap with live balances + quotes
- STRK staking on mainnet
- Dashboard with activity feed + tx links
- Cairo escrow contract deployed on **mainnet + Sepolia**
- Supabase PostgreSQL (persistent database)

### 🔜 V2 (Post-Bounty subject to change)

- Admin dashboard for platform management
- Campaign verification system
- Milestone-based funding release
- Backer reputation profiles (on-chain)
- DCA integration (recurring contributions)
- Bridge support (fund from Ethereum/Solana)

---

## 📄 License

MIT

---

Built with ⚡ [Starkzap SDK](https://docs.starknet.io/build/starkzap/overview) on [Starknet](https://starknet.io)