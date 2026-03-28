// ─────────────────────────────────────────────────────────
// server/refund-cron.js
// Production auto-refund: runs every hour
// Now uses Supabase instead of SQLite
// ─────────────────────────────────────────────────────────
import { uint256 } from "starknet";

const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const REFUND_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

export function startRefundCron(supabase, platformAccount, provider) {
  if (!platformAccount) {
    console.log("[refund-cron] No platformAccount — cron disabled");
    return;
  }
  if (!supabase) {
    console.log("[refund-cron] No supabase client — cron disabled");
    return;
  }

  console.log("🔄 Auto-refund cron started (checks every hour)");

  const checkAndRefund = async () => {
    const now = new Date().toISOString();

    const { data: expired } = await supabase
      .from("campaigns")
      .select("*")
      .lt("deadline", now)
      .lt("raised", "goal")
      .eq("status", "active")
      .eq("refunded", false)
      .gt("raised", 0);

    if (!expired || expired.length === 0) return;

    console.log(`[refund-cron] Found ${expired.length} expired campaigns`);

    for (const campaign of expired) {
      try {
        const { data: backers } = await supabase
          .from("contributions")
          .select("*")
          .eq("campaign_id", campaign.id)
          .eq("refunded", false);

        if (!backers || backers.length === 0) {
          await supabase
            .from("campaigns")
            .update({ status: "refunded", refunded: true, refunded_at: now })
            .eq("id", campaign.id);
          continue;
        }

        console.log(`[refund-cron] Refunding ${backers.length} backers for "${campaign.title}"`);

        const calls = backers.map((b) => ({
          contractAddress: STRK_ADDRESS,
          entrypoint: "transfer",
          calldata: [b.backer_address, ...uint256.bnToUint256(BigInt(Math.round(b.amount * 1e18)))],
        }));

        const tx = await platformAccount.execute(calls);
        await provider.waitForTransaction(tx.transaction_hash);

        for (const b of backers) {
          await supabase
            .from("contributions")
            .update({ refunded: true, refund_tx_hash: tx.transaction_hash })
            .eq("id", b.id);
        }

        await supabase
          .from("campaigns")
          .update({
            status: "refunded",
            refunded: true,
            refunded_at: now,
            refund_tx: tx.transaction_hash,
            raised: 0,
          })
          .eq("id", campaign.id);

        console.log(`[refund-cron] ✅ Refunded "${campaign.title}" — tx: ${tx.transaction_hash}`);
      } catch (err) {
        console.error(`[refund-cron] ❌ Failed for "${campaign.title}":`, err.message);
      }
    }
  };

  checkAndRefund();
  setInterval(checkAndRefund, REFUND_CHECK_INTERVAL);
}