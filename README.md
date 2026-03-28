# ⚡ StarkFund — Gasless Micro-Fundraising on Starknet

> Fund the next big idea. One tap. Zero gas. Built with [Starkzap SDK](https://docs.starknet.io/build/starkzap/overview).

**StarkFund** is a gasless micro-fundraising platform on Starknet. Founders post startup ideas with a STRK funding goal. Backers contribute in one tap. All transactions are gasless via Cartridge Controller. Funds are held in escrow until the goal is met — if not, backers get automatic refunds.

Built for the **Starkzap Developer Bounty Challenge V2** ($3,000 pool).

🔗 **Live Demo:** [starkfund.vercel.app](https://starkfund.vercel.app)
📦 **Repo:** [github.com/yourusername/starkfund](https://github.com/yourusername/starkfund)

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

## 🔧 Starkzap SDK Integration (10+ modules)

This project deeply integrates the Starkzap SDK across every user-facing feature:

| SDK Module | Where Used | How |
|---|---|---|
| `sdk.onboard()` | `useWallet.js` | Social login via `OnboardStrategy.Cartridge` with session policies |
| `wallet.transfer()` | `useWallet.js` | Fund campaigns, pay launch fee, vote proof tx, batch refunds |
| `wallet.swap()` | `SwapModal.jsx`, `useWallet.js` | Token swaps via AVNU + Ekubo, pay-with-USDC/ETH flow |
| `wallet.getQuote()` | `SwapModal.jsx`, `FundModal.jsx` | Live swap rates with provider fallback |
| `wallet.balanceOf()` | `WalletPanel.jsx` | Real-time STRK/ETH/USDC balance display |
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
- **Token swap** — Standalone swap interface (STRK ↔ ETH ↔ USDC)
- **STRK staking** — Stake into validator pools with APY display
- **Live quotes** — Real-time swap rates with price impact

### UX
- **Dashboard** — Active / Completed / Expired / Activity tabs
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

## 🏗️ Architecture

```
starkfund/
├── contracts/                    # Cairo 2.9 escrow contract (compiled, V2)
│   ├── Scarb.toml
│   └── src/
│       ├── lib.cairo
│       └── starkfund_escrow.cairo
├── server/                       # Express.js backend
│   ├── package.json
│   ├── index.js                  # API + escrow release/refund/vote endpoints
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
│   │   ├── Campaign.jsx          # Detail + fund + vote + share
│   │   └── Dashboard.jsx         # Active/Completed/Expired/Activity tabs
│   └── components/
│       ├── Navbar.jsx             # Logo + Dashboard + wallet display
│       ├── CampaignCard.jsx       # Grid card with progress bar
│       ├── WalletPanel.jsx        # Balance + Stake + Swap buttons
│       ├── FundModal.jsx          # Fund with STRK/ETH/USDC + escrow
│       ├── StakeModal.jsx         # STRK staking + pool discovery
│       ├── SwapModal.jsx          # Token swap + live quotes
│       ├── CreateModal.jsx        # Campaign creation + 10 STRK fee
│       ├── FounderPanel.jsx       # Withdraw / Stake / Refund controls
│       ├── VoteRefund.jsx         # Backer voting + batch refund
│       ├── ShareCampaign.jsx      # Twitter + Telegram + copy link
│       └── ErrorBoundary.jsx      # Crash recovery UI
```

### Fund Flow (Escrow Model)

```
Backer funds campaign:
  └→ wallet.transfer(STRK) → PLATFORM_WALLET (escrow)
  └→ Server records contribution in SQLite

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
  └→ >50% threshold → server sets status = pending_refund
  └→ Batch refund executes on-chain
```

---

## 🔗 On-Chain Deployments

### Cairo Escrow Contract (Sepolia)

| Item | Value |
|---|---|
| **Contract Address** | [`0x02e0a03380ae53ff6827dfc3727640ceb349b244dc2a2389a6baabe03a89395c`](https://sepolia.voyager.online/contract/0x02e0a03380ae53ff6827dfc3727640ceb349b244dc2a2389a6baabe03a89395c) |
| **Class Hash** | `0x004abc63466c43e6494e0b32d6add0e069a0c2fe9d7fc576b2582fbca493e702` |
| **Declare Tx** | [`0x076c87c34fafb623c763f7de8f76ccd112808bf8c4623c59e140d3118e29d058`](https://sepolia.voyager.online/tx/0x076c87c34fafb623c763f7de8f76ccd112808bf8c4623c59e140d3118e29d058) |
| **Deploy Tx** | [`0x063d6626d10388e7c19a67cf45ce14e01c0d8cc6bcdf3043ce0f9365ce6ae359`](https://sepolia.voyager.online/tx/0x063d6626d10388e7c19a67cf45ce14e01c0d8cc6bcdf3043ce0f9365ce6ae359) |
| **Platform Wallet** | `0x03b54E9B11F48b21018d8BdbF2407aA99198eE698996a154b63fF978c19273eF` |
| **Platform Fee** | 150 bps (1.5%) |
| **Network** | Starknet Sepolia |

### Verified Transactions (Sepolia)

| Action | Tx Hash | Details |
|---|---|---|
| Contract declare | [`0x076c87c...`](https://sepolia.voyager.online/tx/0x076c87c34fafb623c763f7de8f76ccd112808bf8c4623c59e140d3118e29d058) | Cairo escrow contract class declared |
| Contract deploy | [`0x063d662...`](https://sepolia.voyager.online/tx/0x063d6626d10388e7c19a67cf45ce14e01c0d8cc6bcdf3043ce0f9365ce6ae359) | Escrow contract instance created |
| Fund campaign | `0x36da9a8...` | 9.85 STRK to campaign + 0.15 STRK fee |
| Batch refund | `0x47021318af...` | STRK returned to all backers in 1 tx |
| Launch fee | — | 10 STRK transfer to platform wallet |

All transactions viewable on [Sepolia Voyager](https://sepolia.voyager.online).

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/starkfund.git
cd starkfund
npm install
cd server && npm install && cd ..
```

### 2. Environment Setup

**Root `.env`:**
```env
VITE_NETWORK=sepolia
VITE_API_URL=http://localhost:3001
VITE_PLATFORM_WALLET=0xYOUR_PLATFORM_ADDRESS
```

**`server/.env`:**
```env
PORT=3001
NETWORK=sepolia
PLATFORM_WALLET=0xYOUR_PLATFORM_ADDRESS
FRONTEND_URL=http://localhost:5173
PLATFORM_PRIVATE_KEY=0xYOUR_PRIVATE_KEY  # optional: enables auto release/refund
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

## 📜 Cairo Smart Contract (Deployed on Sepolia ✅)

The `contracts/` directory contains a full Cairo escrow contract with:

- `create_campaign()` — register campaign with goal + deadline + token
- `contribute()` — backer deposits to escrow (ERC20 transferFrom)
- `withdraw()` — founder claims funds (minus platform fee) after goal met
- `refund()` — mark campaign refundable (deadline passed or vote threshold)
- `claim_refund()` — individual backer claims their refund
- `vote_refund()` — backer votes for early refund (1 vote per backer)
- Full OpenZeppelin ERC20 integration

**Status:** Compiled with `scarb build`, **deployed on Sepolia** with `starkli`. The V1 app uses a JS escrow (platform wallet) while the on-chain contract is deployed and ready for V2 integration.

```bash
cd contracts
scarb build
# Deploy: starkli declare + starkli deploy <CLASS_HASH> <PLATFORM_WALLET> <FEE_BPS>
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
| Backend | Express.js + SQLite (better-sqlite3) |
| Blockchain | Starknet (Sepolia → Mainnet) |
| Smart Contract | Cairo 2.9 + OpenZeppelin 0.20.0 |
| Deployment | Vercel (frontend) + Render (backend) |

---

## 🗺️ Roadmap

### ✅ V1 (Current — Bounty Submission)
- [x] Cartridge Controller social login
- [x] Gasless transactions
- [x] Campaign CRUD with 10 STRK launch fee
- [x] Fund with STRK/ETH/USDC (auto-swap)
- [x] Escrow model (platform wallet)
- [x] 1.5% platform fee on release
- [x] Backer voting for early refund
- [x] Auto-refund cron for expired campaigns
- [x] Batch refund in single tx
- [x] Token swap + staking
- [x] Dashboard with activity feed
- [x] Cairo escrow contract (compiled + **deployed on Sepolia**)

### 🔜 V2 (Post-Bounty)
- [ ] Wire frontend to on-chain escrow (replace JS escrow with deployed contract)
- [ ] Admin dashboard for platform management
- [ ] Campaign verification system
- [ ] Milestone-based funding release
- [ ] Backer reputation profiles (on-chain)
- [ ] DCA integration (recurring contributions)
- [ ] Bridge support (fund from Ethereum/Solana)

---

## 📄 License

MIT

---

<p align="center">
  Built with ⚡ <a href="https://docs.starknet.io/build/starkzap/overview">Starkzap SDK</a> on <a href="https://starknet.io">Starknet</a>
</p>