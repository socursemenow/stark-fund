// ─────────────────────────────────────────────────────────
// server/index.js — Express API with Supabase PostgreSQL
// Persistent storage — survives Render redeploys
// ─────────────────────────────────────────────────────────
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { RpcProvider, Account, Contract, uint256, cairo } from "starknet";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// ── Supabase ──────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("[db] Supabase connected:", SUPABASE_URL);

// ── Platform config ───────────────────────────────────────────────────
const NETWORK = process.env.NETWORK || "sepolia";
const PLATFORM_WALLET = process.env.PLATFORM_WALLET;
const PLATFORM_PRIVATE_KEY = process.env.PLATFORM_PRIVATE_KEY;
const PLATFORM_FEE_BPS = 150;
const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const RPC_URL =
  NETWORK === "mainnet"
    ? "https://starknet-mainnet.public.blastapi.io"
    : "https://starknet-sepolia.public.blastapi.io";

// ── Starknet provider + account ───────────────────────────────────────
const provider = new RpcProvider({ nodeUrl: RPC_URL });
let platformAccount = null;

if (PLATFORM_WALLET && PLATFORM_PRIVATE_KEY) {
  platformAccount = new Account(provider, PLATFORM_WALLET, PLATFORM_PRIVATE_KEY);
  console.log(`[escrow] Platform account ready: ${PLATFORM_WALLET.slice(0, 10)}…`);
} else {
  console.warn("[escrow] ⚠️ No PLATFORM_PRIVATE_KEY — release/refund queued only");
}

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
// Open CORS for now — restrict to FRONTEND_URL after confirming it works
app.use(cors());
app.use(express.json());

// ── Helpers ────────────────────────────────────────────────────────────
function toUint256Wei(amountSTRK) {
  const wei = BigInt(Math.round(amountSTRK * 1e18));
  return cairo.uint256(wei);
}

async function campaignWithBackers(campaignId) {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (!campaign) return null;

  const { data: backers } = await supabase
    .from("contributions")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  const { data: activeBackers } = await supabase
    .from("contributions")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("refunded", false);

  const { data: votes } = await supabase
    .from("votes")
    .select("*")
    .eq("campaign_id", campaignId);

  const realRaised = (activeBackers || []).reduce((s, c) => s + c.amount, 0);
  const uniqueBackers = new Set((activeBackers || []).map((b) => b.backer_address.toLowerCase()));
  const backerCount = uniqueBackers.size;
  const voteCount = (votes || []).length;
  const votesNeeded = Math.ceil(backerCount / 2) + 1;

  return {
    ...campaign,
    raised: realRaised,
    staked: !!campaign.staked,
    backers: backers || [],
    backerCount,
    voteCount,
    votesNeeded,
  };
}

// ─── ROUTES ───────────────────────────────────────────────────────────

// GET /api/campaigns
app.get("/api/campaigns", async (req, res) => {
  try {
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    const results = await Promise.all(
      (campaigns || []).map((c) => campaignWithBackers(c.id))
    );

    res.json(results.filter(Boolean));
  } catch (err) {
    console.error("[GET campaigns]", err);
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

// GET /api/campaigns/:id
app.get("/api/campaigns/:id", async (req, res) => {
  try {
    const data = await campaignWithBackers(req.params.id);
    if (!data) return res.status(404).json({ error: "Campaign not found" });
    res.json(data);
  } catch (err) {
    console.error("[GET campaign]", err);
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

// POST /api/campaigns — Create
app.post("/api/campaigns", async (req, res) => {
  try {
    const {
      title, tagline, description, category, goal,
      wallet_address, founder_address, founder_name,
      deadline, twitter, discord, telegram, launch_fee_tx,
    } = req.body;

    if (!title || !goal || !wallet_address || !founder_address || !deadline) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { error } = await supabase.from("campaigns").insert({
      id,
      title,
      tagline: tagline || "",
      description: description || "",
      category: category || "Other",
      goal,
      wallet_address,
      founder_address,
      founder_name: founder_name || "Anonymous",
      deadline,
      twitter: twitter || "",
      discord: discord || "",
      telegram: telegram || "",
      launch_fee_tx: launch_fee_tx || "",
    });

    if (error) throw error;

    const data = await campaignWithBackers(id);
    res.status(201).json(data);
  } catch (err) {
    console.error("[POST campaign]", err);
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

// POST /api/campaigns/:id/fund
app.post("/api/campaigns/:id/fund", async (req, res) => {
  try {
    const { backer_address, amount, token_paid, amount_paid, tx_hash } = req.body;

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const status = campaign.status || "active";
    if (status !== "active") {
      return res.status(400).json({ error: `Campaign is ${status}, cannot fund` });
    }

    if (new Date(campaign.deadline) < new Date()) {
      return res.status(400).json({ error: "Campaign deadline has passed. Funding is closed." });
    }

    if (campaign.refunded) {
      return res.status(400).json({ error: "Campaign has been refunded." });
    }

    if (!backer_address || !amount || amount <= 0) {
      return res.status(400).json({ error: "Missing backer_address or valid amount" });
    }

    // Check overfunding
    const { data: activeBackers } = await supabase
      .from("contributions")
      .select("amount")
      .eq("campaign_id", req.params.id)
      .eq("refunded", false);

    const currentRaised = (activeBackers || []).reduce((s, c) => s + c.amount, 0);
    const remaining = campaign.goal - currentRaised;

    if (remaining <= 0) {
      return res.status(400).json({ error: "Campaign is already fully funded." });
    }

    const cappedAmount = Math.min(amount, remaining);
    const wasCapped = cappedAmount < amount;

    // Duplicate check
    if (tx_hash) {
      const { data: dup } = await supabase
        .from("contributions")
        .select("id")
        .eq("tx_hash", tx_hash)
        .maybeSingle();
      if (dup) {
        const data = await campaignWithBackers(req.params.id);
        return res.json(data);
      }
    }

    // Insert contribution
    const { error } = await supabase.from("contributions").insert({
      campaign_id: req.params.id,
      backer_address,
      amount: cappedAmount,
      token_paid: token_paid || "STRK",
      amount_paid: amount_paid || cappedAmount,
      tx_hash: tx_hash || "",
    });
    if (error) throw error;

    // Update raised
    await supabase
      .from("campaigns")
      .update({ raised: currentRaised + cappedAmount })
      .eq("id", req.params.id);

    const updated = await campaignWithBackers(req.params.id);
    const goalMet = updated.raised >= campaign.goal;

    res.json({
      ...updated,
      goalMet,
      cappedAmount,
      wasOverfund: wasCapped,
      message: wasCapped
        ? `Contribution capped to ${cappedAmount.toFixed(2)} STRK (remaining goal).`
        : goalMet
          ? "Goal reached! Founder can now request release."
          : "Contribution recorded",
    });
  } catch (err) {
    console.error("[POST fund]", err);
    res.status(500).json({ error: "Failed to record contribution" });
  }
});

// POST /api/campaigns/:id/release
app.post("/api/campaigns/:id/release", async (req, res) => {
  try {
    const { founder } = req.body;
    const data = await campaignWithBackers(req.params.id);

    if (!data) return res.status(404).json({ error: "Campaign not found" });
    if (data.status && data.status !== "active") {
      return res.status(400).json({ error: `Campaign is ${data.status}, cannot release` });
    }
    if (data.founder_address.toLowerCase() !== founder?.toLowerCase()) {
      return res.status(403).json({ error: "Only the founder can request release" });
    }
    if (data.raised < data.goal) {
      return res.status(400).json({ error: `Goal not met. Raised ${data.raised.toFixed(2)} / ${data.goal} STRK` });
    }
    if (data.release_tx) {
      return res.status(400).json({ error: "Funds already released" });
    }

    const fee = (data.raised * PLATFORM_FEE_BPS) / 10000;
    const netAmount = data.raised - fee;

    if (platformAccount) {
      try {
        const strkContract = new Contract(ERC20_ABI, STRK_ADDRESS, platformAccount);
        const tx = await strkContract.transfer(data.founder_address, toUint256Wei(netAmount));
        await provider.waitForTransaction(tx.transaction_hash);

        await supabase
          .from("campaigns")
          .update({ status: "funded", release_tx: tx.transaction_hash })
          .eq("id", req.params.id);

        return res.json({
          success: true,
          releaseTxHash: tx.transaction_hash,
          netAmount: Math.round(netAmount * 1000) / 1000,
          fee: Math.round(fee * 1000) / 1000,
        });
      } catch (err) {
        console.error("[release] On-chain failed:", err);
        return res.status(500).json({ error: "Release tx failed: " + err.message });
      }
    }

    await supabase
      .from("campaigns")
      .update({ status: "pending_release" })
      .eq("id", req.params.id);

    res.json({
      success: true,
      queued: true,
      netAmount: Math.round(netAmount * 1000) / 1000,
      fee: Math.round(fee * 1000) / 1000,
      message: "Release queued.",
    });
  } catch (err) {
    console.error("[POST release]", err);
    res.status(500).json({ error: "Release failed" });
  }
});

// POST /api/campaigns/:id/refund
app.post("/api/campaigns/:id/refund", async (req, res) => {
  try {
    const { caller, reason } = req.body;
    const data = await campaignWithBackers(req.params.id);

    if (!data) return res.status(404).json({ error: "Campaign not found" });
    if (["funded", "refunded"].includes(data.status)) {
      return res.status(400).json({ error: `Campaign already ${data.status}` });
    }

    const isExpired = new Date(data.deadline) < new Date();
    const isFounder = data.founder_address.toLowerCase() === caller?.toLowerCase();
    const votePassed = data.voteCount >= data.votesNeeded && data.backerCount > 0;

    if (reason === "expired" && !isExpired) return res.status(400).json({ error: "Not expired yet" });
    if (reason === "founder_initiated" && !isFounder) return res.status(403).json({ error: "Only founder" });
    if (reason === "vote_passed" && !votePassed) return res.status(400).json({ error: "Vote not passed" });

    const { data: contribs } = await supabase
      .from("contributions")
      .select("*")
      .eq("campaign_id", req.params.id)
      .eq("refunded", false);

    if (!contribs || contribs.length === 0) {
      return res.status(400).json({ error: "No contributions to refund" });
    }

    if (platformAccount) {
      try {
        const calls = contribs.map((c) => ({
          contractAddress: STRK_ADDRESS,
          entrypoint: "transfer",
          calldata: [c.backer_address, ...uint256.bnToUint256(BigInt(Math.round(c.amount * 1e18)))],
        }));

        const tx = await platformAccount.execute(calls);
        await provider.waitForTransaction(tx.transaction_hash);

        // Mark contributions refunded
        for (const c of contribs) {
          await supabase
            .from("contributions")
            .update({ refunded: true, refund_tx_hash: tx.transaction_hash })
            .eq("id", c.id);
        }

        await supabase
          .from("campaigns")
          .update({
            status: "refunded",
            refunded: true,
            refunded_at: new Date().toISOString(),
            refund_tx: tx.transaction_hash,
            raised: 0,
          })
          .eq("id", req.params.id);

        const totalRefunded = contribs.reduce((s, c) => s + c.amount, 0);
        return res.json({
          success: true,
          refundTxHash: tx.transaction_hash,
          totalRefunded: Math.round(totalRefunded * 1000) / 1000,
          backerCount: new Set(contribs.map((c) => c.backer_address)).size,
        });
      } catch (err) {
        console.error("[refund] On-chain failed:", err);
        return res.status(500).json({ error: "Refund tx failed: " + err.message });
      }
    }

    // Queue mode
    for (const c of contribs) {
      await supabase
        .from("contributions")
        .update({ refunded: true })
        .eq("id", c.id);
    }

    await supabase
      .from("campaigns")
      .update({
        status: "pending_refund",
        refunded: true,
        refunded_at: new Date().toISOString(),
      })
      .eq("id", req.params.id);

    const totalRefunded = contribs.reduce((s, c) => s + c.amount, 0);
    res.json({
      success: true,
      queued: true,
      totalRefunded: Math.round(totalRefunded * 1000) / 1000,
      backerCount: new Set(contribs.map((c) => c.backer_address)).size,
      message: "Refund queued.",
    });
  } catch (err) {
    console.error("[POST refund]", err);
    res.status(500).json({ error: "Refund failed" });
  }
});

// POST /api/campaigns/:id/vote
app.post("/api/campaigns/:id/vote", async (req, res) => {
  try {
    const { voter, txHash } = req.body;

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("status")
      .eq("id", req.params.id)
      .single();

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status && campaign.status !== "active") {
      return res.status(400).json({ error: "Campaign is not active" });
    }

    // Verify backer
    const { data: backers } = await supabase
      .from("contributions")
      .select("backer_address")
      .eq("campaign_id", req.params.id)
      .eq("refunded", false);

    const isBacker = (backers || []).some(
      (b) => b.backer_address.toLowerCase() === voter?.toLowerCase()
    );
    if (!isBacker) return res.status(403).json({ error: "Only backers can vote" });

    // Insert vote (UNIQUE constraint prevents duplicates)
    const { error } = await supabase.from("votes").insert({
      campaign_id: req.params.id,
      voter_address: voter,
      tx_hash: txHash || "",
    });

    if (error) {
      if (error.code === "23505") { // unique violation
        return res.status(400).json({ error: "You already voted" });
      }
      throw error;
    }

    // Get updated counts
    const uniqueBackers = new Set((backers || []).map((b) => b.backer_address.toLowerCase()));
    const backerCount = uniqueBackers.size;

    const { count: newVoteCount } = await supabase
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", req.params.id);

    const votesNeeded = Math.ceil(backerCount / 2) + 1;
    const refundTriggered = newVoteCount >= votesNeeded;

    if (refundTriggered) {
      await supabase
        .from("campaigns")
        .update({ status: "pending_refund" })
        .eq("id", req.params.id);
    }

    res.json({
      success: true,
      votesFor: newVoteCount,
      votesNeeded,
      backerCount,
      refundTriggered,
    });
  } catch (err) {
    console.error("[POST vote]", err);
    res.status(500).json({ error: "Vote failed" });
  }
});

// GET /api/campaigns/:id/votes
app.get("/api/campaigns/:id/votes", async (req, res) => {
  try {
    const { data: votes } = await supabase
      .from("votes")
      .select("*")
      .eq("campaign_id", req.params.id);

    const { data: activeBackers } = await supabase
      .from("contributions")
      .select("backer_address")
      .eq("campaign_id", req.params.id)
      .eq("refunded", false);

    const backerCount = new Set((activeBackers || []).map((b) => b.backer_address.toLowerCase())).size;
    const votesNeeded = Math.ceil(backerCount / 2) + 1;

    res.json({
      votes: votes || [],
      voteCount: (votes || []).length,
      backerCount,
      votesNeeded,
      passed: (votes || []).length >= votesNeeded && backerCount > 0,
    });
  } catch (err) {
    console.error("[GET votes]", err);
    res.status(500).json({ error: "Failed to get votes" });
  }
});

// POST /api/campaigns/:id/stake
app.post("/api/campaigns/:id/stake", async (req, res) => {
  try {
    const { yield_earned } = req.body;

    await supabase
      .from("campaigns")
      .update({ staked: true, yield_earned: yield_earned || 0 })
      .eq("id", req.params.id);

    const data = await campaignWithBackers(req.params.id);
    res.json(data);
  } catch (err) {
    console.error("[POST stake]", err);
    res.status(500).json({ error: "Failed to record stake" });
  }
});

// GET /api/backers/:address/history
app.get("/api/backers/:address/history", async (req, res) => {
  try {
    const { data: contribs } = await supabase
      .from("contributions")
      .select("*, campaigns(title, status)")
      .ilike("backer_address", req.params.address)
      .order("created_at", { ascending: false });

    const mapped = (contribs || []).map((c) => ({
      ...c,
      campaign_title: c.campaigns?.title,
      campaign_status: c.campaigns?.status,
    }));

    res.json(mapped);
  } catch (err) {
    console.error("[GET backer history]", err);
    res.status(500).json({ error: "Failed to get history" });
  }
});

// Health check
app.get("/api/health", async (req, res) => {
  const { count: campaignCount } = await supabase
    .from("campaigns")
    .select("*", { count: "exact", head: true });
  const { count: contribCount } = await supabase
    .from("contributions")
    .select("*", { count: "exact", head: true });

  res.json({
    status: "ok",
    network: NETWORK,
    database: "supabase",
    hasPlatformAccount: !!platformAccount,
    campaigns: campaignCount || 0,
    contributions: contribCount || 0,
  });
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`StarkFund API running on http://localhost:${PORT}`);
  console.log(`[StarkFund] Network: ${NETWORK} | DB: Supabase | Platform: ${PLATFORM_WALLET?.slice(0, 10) || "NOT SET"}… | Release: ${platformAccount ? "AUTO" : "QUEUED"}`);
});