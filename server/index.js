// ─────────────────────────────────────────────────────────
// server/index.js — Express API for campaigns
// Escrow release, refund, vote + all edge cases handled
// ─────────────────────────────────────────────────────────
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import { RpcProvider, Account, Contract, uint256, cairo } from "starknet";
import { startRefundCron } from "./refund-cron.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// ── Platform config ───────────────────────────────────────────────────
const NETWORK = process.env.NETWORK || "sepolia";
const PLATFORM_WALLET = process.env.PLATFORM_WALLET;
const PLATFORM_PRIVATE_KEY = process.env.PLATFORM_PRIVATE_KEY;
const PLATFORM_FEE_BPS = 150; // 1.5%
const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const RPC_URL =
  NETWORK === "mainnet"
    ? "https://starknet-mainnet.public.blastapi.io"
    : "https://starknet-sepolia.public.blastapi.io";

// ── Starknet provider + account (for server-side releases/refunds) ───
const provider = new RpcProvider({ nodeUrl: RPC_URL });
let platformAccount = null;

if (PLATFORM_WALLET && PLATFORM_PRIVATE_KEY) {
  platformAccount = new Account(provider, PLATFORM_WALLET, PLATFORM_PRIVATE_KEY);
  console.log(`[escrow] Platform account ready: ${PLATFORM_WALLET.slice(0, 10)}…`);
} else {
  console.warn("[escrow] ⚠️ No PLATFORM_PRIVATE_KEY — release/refund will be queued only");
}

// ── ERC-20 ABI (just transfer) ────────────────────────────────────────
const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "recipient", type: "felt" },
      { name: "amount", type: "Uint256" },
    ],
    outputs: [{ name: "success", type: "felt" }],
  },
];

// ── Middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin: [FRONTEND_URL, "http://localhost:5173", "http://localhost:5174"],
}));
app.use(express.json());

// ── Database Setup ────────────────────────────────────────────────────
const db = new Database("starkfund.db");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    tagline TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'Other',
    goal REAL NOT NULL,
    raised REAL DEFAULT 0,
    wallet_address TEXT NOT NULL,
    founder_address TEXT NOT NULL,
    founder_name TEXT,
    deadline TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    staked INTEGER DEFAULT 0,
    yield_earned REAL DEFAULT 0,
    refunded INTEGER DEFAULT 0,
    refunded_at TEXT,
    release_tx TEXT,
    refund_tx TEXT,
    launch_fee_tx TEXT,
    twitter TEXT,
    discord TEXT,
    telegram TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,
    backer_address TEXT NOT NULL,
    amount REAL NOT NULL,
    token_paid TEXT DEFAULT 'STRK',
    amount_paid REAL,
    tx_hash TEXT,
    refunded INTEGER DEFAULT 0,
    refund_tx_hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,
    voter_address TEXT NOT NULL,
    tx_hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(campaign_id, voter_address),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );
`);

// ── Migration: add columns if upgrading from old schema ───────────────
const safeAddColumn = (table, col, type) => {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); }
  catch { /* column already exists */ }
};
safeAddColumn("campaigns", "status", "TEXT DEFAULT 'active'");
safeAddColumn("campaigns", "release_tx", "TEXT");
safeAddColumn("campaigns", "refund_tx", "TEXT");
safeAddColumn("campaigns", "launch_fee_tx", "TEXT");
safeAddColumn("contributions", "refund_tx_hash", "TEXT");

// ── Prepared Statements ───────────────────────────────────────────────
const stmts = {
  allCampaigns: db.prepare(`SELECT * FROM campaigns ORDER BY created_at DESC`),
  getCampaign: db.prepare(`SELECT * FROM campaigns WHERE id = ?`),
  getBackers: db.prepare(`SELECT * FROM contributions WHERE campaign_id = ? ORDER BY created_at DESC`),
  getActiveBackers: db.prepare(`SELECT * FROM contributions WHERE campaign_id = ? AND refunded = 0`),
  insertContribution: db.prepare(`
    INSERT INTO contributions (campaign_id, backer_address, amount, token_paid, amount_paid, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  updateRaised: db.prepare(`UPDATE campaigns SET raised = raised + ? WHERE id = ?`),
  updateStaked: db.prepare(`UPDATE campaigns SET staked = 1, yield_earned = ? WHERE id = ?`),
  getVotes: db.prepare(`SELECT * FROM votes WHERE campaign_id = ?`),
  getVoteCount: db.prepare(`SELECT COUNT(*) as cnt FROM votes WHERE campaign_id = ?`),
  insertVote: db.prepare(`INSERT INTO votes (campaign_id, voter_address, tx_hash) VALUES (?, ?, ?)`),
  getUniqueBackerCount: db.prepare(`SELECT COUNT(DISTINCT backer_address) as cnt FROM contributions WHERE campaign_id = ? AND refunded = 0`),
};

// ── Helpers ────────────────────────────────────────────────────────────
function campaignWithBackers(campaign) {
  if (!campaign) return null;
  const backers = stmts.getBackers.all(campaign.id);
  const backerCount = stmts.getUniqueBackerCount.get(campaign.id).cnt;
  const voteCount = stmts.getVoteCount.get(campaign.id).cnt;
  const votesNeeded = Math.ceil(backerCount / 2) + 1;

  const activeBackers = stmts.getActiveBackers.all(campaign.id);
  const realRaised = activeBackers.reduce((s, c) => s + c.amount, 0);

  return {
    ...campaign,
    raised: realRaised,
    staked: !!campaign.staked,
    backers,
    backerCount,
    voteCount,
    votesNeeded,
  };
}

function toUint256Wei(amountSTRK) {
  const wei = BigInt(Math.round(amountSTRK * 1e18));
  return cairo.uint256(wei);
}

// ─── ROUTES ───────────────────────────────────────────────────────────

// GET /api/campaigns — List all campaigns
app.get("/api/campaigns", (req, res) => {
  const campaigns = stmts.allCampaigns.all().map(campaignWithBackers);
  res.json(campaigns);
});

// GET /api/campaigns/:id — Single campaign with backers
app.get("/api/campaigns/:id", (req, res) => {
  const campaign = stmts.getCampaign.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  res.json(campaignWithBackers(campaign));
});

// POST /api/campaigns — Create a new campaign
app.post("/api/campaigns", (req, res) => {
  const {
    title, tagline, description, category, goal,
    wallet_address, founder_address, founder_name,
    deadline, twitter, discord, telegram, launch_fee_tx,
  } = req.body;

  if (!title || !goal || !wallet_address || !founder_address || !deadline) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(`
    INSERT INTO campaigns (id, title, tagline, description, category, goal, wallet_address, founder_address, founder_name, deadline, twitter, discord, telegram, launch_fee_tx)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, title, tagline || "", description || "",
    category || "Other", goal, wallet_address,
    founder_address, founder_name || "Anonymous", deadline,
    twitter || "", discord || "", telegram || "",
    launch_fee_tx || ""
  );

  const campaign = campaignWithBackers(stmts.getCampaign.get(id));
  res.status(201).json(campaign);
});

// ── FUND: Record a contribution (all edge cases handled) ──────────────
app.post("/api/campaigns/:id/fund", (req, res) => {
  const { backer_address, amount, token_paid, amount_paid, tx_hash } = req.body;
  const campaign = stmts.getCampaign.get(req.params.id);

  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  // Validate: status must be active
  const status = campaign.status || "active";
  if (status !== "active") {
    return res.status(400).json({ error: `Campaign is ${status}, cannot fund` });
  }

  // Validate: deadline not passed
  const isExpired = new Date(campaign.deadline) < new Date();
  if (isExpired) {
    return res.status(400).json({ error: "Campaign deadline has passed. Funding is closed." });
  }

  // Validate: not already refunded (backwards compat)
  if (campaign.refunded) {
    return res.status(400).json({ error: "Campaign has been refunded. Cannot accept new funds." });
  }

  // Validate: required fields
  if (!backer_address || !amount || amount <= 0) {
    return res.status(400).json({ error: "Missing backer_address or valid amount" });
  }

  // Validate: don't overfund — cap to remaining goal
  const currentRaised = stmts.getActiveBackers.all(campaign.id)
    .reduce((s, c) => s + c.amount, 0);
  const remaining = campaign.goal - currentRaised;

  if (remaining <= 0) {
    return res.status(400).json({ error: "Campaign is already fully funded. No more contributions accepted." });
  }

  const cappedAmount = Math.min(amount, remaining);
  const wasCapped = cappedAmount < amount;

  // Duplicate tx check
  if (tx_hash) {
    const dup = db.prepare("SELECT id FROM contributions WHERE tx_hash = ?").get(tx_hash);
    if (dup) return res.json(campaignWithBackers(stmts.getCampaign.get(campaign.id)));
  }

  // Record contribution
  const txn = db.transaction(() => {
    stmts.insertContribution.run(
      campaign.id, backer_address, cappedAmount,
      token_paid || "STRK", amount_paid || cappedAmount, tx_hash || ""
    );
    stmts.updateRaised.run(cappedAmount, campaign.id);
  });
  txn();

  const updated = campaignWithBackers(stmts.getCampaign.get(campaign.id));
  const goalMet = updated.raised >= campaign.goal;

  res.json({
    ...updated,
    goalMet,
    cappedAmount,
    wasOverfund: wasCapped,
    message: wasCapped
      ? `Contribution capped to ${cappedAmount.toFixed(2)} STRK (remaining goal). ${(amount - cappedAmount).toFixed(2)} STRK excess was not charged.`
      : goalMet
        ? "Goal reached! Founder can now request release."
        : "Contribution recorded",
  });
});

// ── ESCROW: Release funds to founder ──────────────────────────────────
app.post("/api/campaigns/:id/release", async (req, res) => {
  const { founder } = req.body;
  const campaign = stmts.getCampaign.get(req.params.id);

  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const data = campaignWithBackers(campaign);

  if (campaign.status && campaign.status !== "active") {
    return res.status(400).json({ error: `Campaign is ${campaign.status}, cannot release` });
  }
  if (campaign.founder_address.toLowerCase() !== founder?.toLowerCase()) {
    return res.status(403).json({ error: "Only the founder can request release" });
  }
  if (data.raised < campaign.goal) {
    return res.status(400).json({
      error: `Goal not met. Raised ${data.raised.toFixed(2)} / ${campaign.goal} STRK`,
    });
  }
  if (campaign.release_tx) {
    return res.status(400).json({ error: "Funds already released" });
  }

  const fee = (data.raised * PLATFORM_FEE_BPS) / 10000;
  const netAmount = data.raised - fee;

  if (platformAccount) {
    try {
      const strkContract = new Contract(ERC20_ABI, STRK_ADDRESS, platformAccount);
      const tx = await strkContract.transfer(campaign.founder_address, toUint256Wei(netAmount));
      await provider.waitForTransaction(tx.transaction_hash);

      db.prepare(
        "UPDATE campaigns SET status = 'funded', release_tx = ? WHERE id = ?"
      ).run(tx.transaction_hash, campaign.id);

      return res.json({
        success: true,
        releaseTxHash: tx.transaction_hash,
        netAmount: Math.round(netAmount * 1000) / 1000,
        fee: Math.round(fee * 1000) / 1000,
        message: "Funds released to founder",
      });
    } catch (err) {
      console.error("[release] On-chain tx failed:", err);
      return res.status(500).json({ error: "Release transaction failed: " + err.message });
    }
  }

  db.prepare("UPDATE campaigns SET status = 'pending_release' WHERE id = ?").run(campaign.id);

  res.json({
    success: true,
    queued: true,
    netAmount: Math.round(netAmount * 1000) / 1000,
    fee: Math.round(fee * 1000) / 1000,
    message: "Release queued. Platform admin will process within 24h.",
  });
});

// ── ESCROW: Refund all backers ────────────────────────────────────────
app.post("/api/campaigns/:id/refund", async (req, res) => {
  const { caller, reason } = req.body;
  const campaign = stmts.getCampaign.get(req.params.id);

  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const data = campaignWithBackers(campaign);

  if (campaign.status === "funded" || campaign.status === "refunded") {
    return res.status(400).json({ error: `Campaign already ${campaign.status}` });
  }

  const isExpired = new Date(campaign.deadline) < new Date();
  const isFounder = campaign.founder_address.toLowerCase() === caller?.toLowerCase();
  const votePassed = data.voteCount >= data.votesNeeded && data.backerCount > 0;

  if (reason === "expired" && !isExpired) {
    return res.status(400).json({ error: "Campaign has not expired yet" });
  }
  if (reason === "founder_initiated" && !isFounder) {
    return res.status(403).json({ error: "Only founder can initiate refund" });
  }
  if (reason === "vote_passed" && !votePassed) {
    return res.status(400).json({ error: "Refund vote has not passed yet" });
  }

  const contribs = stmts.getActiveBackers.all(campaign.id);
  if (contribs.length === 0) {
    return res.status(400).json({ error: "No contributions to refund" });
  }

  if (platformAccount) {
    try {
      const calls = contribs.map((c) => ({
        contractAddress: STRK_ADDRESS,
        entrypoint: "transfer",
        calldata: [
          c.backer_address,
          ...uint256.bnToUint256(BigInt(Math.round(c.amount * 1e18))),
        ],
      }));

      const tx = await platformAccount.execute(calls);
      await provider.waitForTransaction(tx.transaction_hash);

      const markRefunded = db.prepare(
        "UPDATE contributions SET refunded = 1, refund_tx_hash = ? WHERE id = ?"
      );
      const updateCampaign = db.prepare(
        "UPDATE campaigns SET status = 'refunded', refunded = 1, refunded_at = datetime('now'), refund_tx = ?, raised = 0 WHERE id = ?"
      );

      db.transaction(() => {
        for (const c of contribs) {
          markRefunded.run(tx.transaction_hash, c.id);
        }
        updateCampaign.run(tx.transaction_hash, campaign.id);
      })();

      const totalRefunded = contribs.reduce((s, c) => s + c.amount, 0);
      const backerSet = new Set(contribs.map((c) => c.backer_address));

      return res.json({
        success: true,
        refundTxHash: tx.transaction_hash,
        totalRefunded: Math.round(totalRefunded * 1000) / 1000,
        backerCount: backerSet.size,
        message: "All backers refunded",
      });
    } catch (err) {
      console.error("[refund] On-chain batch tx failed:", err);
      return res.status(500).json({ error: "Refund transaction failed: " + err.message });
    }
  }

  db.prepare(
    "UPDATE campaigns SET status = 'pending_refund', refunded = 1, refunded_at = datetime('now') WHERE id = ?"
  ).run(campaign.id);
  db.prepare("UPDATE contributions SET refunded = 1 WHERE campaign_id = ?").run(campaign.id);

  const totalRefunded = contribs.reduce((s, c) => s + c.amount, 0);

  res.json({
    success: true,
    queued: true,
    totalRefunded: Math.round(totalRefunded * 1000) / 1000,
    backerCount: new Set(contribs.map((c) => c.backer_address)).size,
    message: "Refund queued. Platform admin will process within 24h.",
  });
});

// ── VOTE for refund ───────────────────────────────────────────────────
app.post("/api/campaigns/:id/vote", (req, res) => {
  const { voter, txHash } = req.body;
  const campaign = stmts.getCampaign.get(req.params.id);

  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign.status && campaign.status !== "active") {
    return res.status(400).json({ error: "Campaign is not active" });
  }

  const backers = stmts.getActiveBackers.all(campaign.id);
  const isBacker = backers.some(
    (b) => b.backer_address.toLowerCase() === voter?.toLowerCase()
  );
  if (!isBacker) {
    return res.status(403).json({ error: "Only backers can vote" });
  }

  try {
    stmts.insertVote.run(campaign.id, voter, txHash || "");
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "You already voted" });
    }
    throw err;
  }

  const backerCount = stmts.getUniqueBackerCount.get(campaign.id).cnt;
  const newVoteCount = stmts.getVoteCount.get(campaign.id).cnt;
  const votesNeeded = Math.ceil(backerCount / 2) + 1;
  const refundTriggered = newVoteCount >= votesNeeded;

  if (refundTriggered) {
    db.prepare("UPDATE campaigns SET status = 'pending_refund' WHERE id = ?").run(campaign.id);
  }

  res.json({
    success: true,
    votesFor: newVoteCount,
    votesNeeded,
    backerCount,
    refundTriggered,
  });
});

// ── GET vote status ───────────────────────────────────────────────────
app.get("/api/campaigns/:id/votes", (req, res) => {
  const campaign = stmts.getCampaign.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const votes = stmts.getVotes.all(campaign.id);
  const backerCount = stmts.getUniqueBackerCount.get(campaign.id).cnt;
  const votesNeeded = Math.ceil(backerCount / 2) + 1;

  res.json({
    votes,
    voteCount: votes.length,
    backerCount,
    votesNeeded,
    passed: votes.length >= votesNeeded && backerCount > 0,
  });
});

// POST /api/campaigns/:id/stake — Record staking activation (unchanged)
app.post("/api/campaigns/:id/stake", (req, res) => {
  const { yield_earned, tx_hash } = req.body;
  const campaign = stmts.getCampaign.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  stmts.updateStaked.run(yield_earned || 0, campaign.id);
  res.json(campaignWithBackers(stmts.getCampaign.get(campaign.id)));
});

// ── GET backer history ────────────────────────────────────────────────
app.get("/api/backers/:address/history", (req, res) => {
  const contribs = db.prepare(`
    SELECT c.*, cam.title as campaign_title, cam.status as campaign_status
    FROM contributions c
    JOIN campaigns cam ON c.campaign_id = cam.id
    WHERE LOWER(c.backer_address) = LOWER(?)
    ORDER BY c.created_at DESC
  `).all(req.params.address);
  res.json(contribs);
});

// ── Health check ──────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  const campaignCount = stmts.allCampaigns.all().length;
  const contribCount = db.prepare("SELECT COUNT(*) as cnt FROM contributions").get().cnt;
  res.json({
    status: "ok",
    network: NETWORK,
    hasPlatformAccount: !!platformAccount,
    campaigns: campaignCount,
    contributions: contribCount,
  });
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`StarkFund API running on http://localhost:${PORT}`);
  console.log(`[StarkFund] Network: ${NETWORK} | Platform: ${PLATFORM_WALLET?.slice(0, 10) || "NOT SET"}… | Release: ${platformAccount ? "AUTO" : "QUEUED"}`);

  // Start auto-refund cron (runs every hour, only if platformAccount is set)
  startRefundCron(db, platformAccount, provider);
});