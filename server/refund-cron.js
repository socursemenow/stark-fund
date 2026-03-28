// ─────────────────────────────────────────────────────────
// server/refund-cron.js
// Production auto-refund: runs every hour, checks deadlines,
// batch-refunds backers via starknet.js platformAccount
//
// Wire into server/index.js after app.listen():
//   import { startRefundCron } from "./refund-cron.js";
//   startRefundCron(db, platformAccount, provider);
// ─────────────────────────────────────────────────────────
import { uint256 } from "starknet";

const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const REFUND_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

export function startRefundCron(db, platformAccount, provider) {
  if (!platformAccount) {
    console.log("[refund-cron] No platformAccount — cron disabled (queued mode only)");
    return;
  }

  console.log("🔄 Auto-refund cron started (checks every hour)");

  const checkAndRefund = async () => {
    const now = new Date().toISOString();

    // Find expired, unfunded, un-refunded campaigns with active status
    const expired = db
      .prepare(
        `SELECT * FROM campaigns
         WHERE deadline < ?
         AND raised < goal
         AND (status = 'active' OR status IS NULL)
         AND refunded = 0
         AND raised > 0`
      )
      .all(now);

    if (expired.length === 0) return;

    console.log(`[refund-cron] Found ${expired.length} expired campaigns to refund`);

    for (const campaign of expired) {
      try {
        const backers = db
          .prepare(`SELECT * FROM contributions WHERE campaign_id = ? AND refunded = 0`)
          .all(campaign.id);

        if (backers.length === 0) {
          // No active contributions — just mark as refunded
          db.prepare("UPDATE campaigns SET status = 'refunded', refunded = 1, refunded_at = ? WHERE id = ?")
            .run(now, campaign.id);
          continue;
        }

        console.log(`[refund-cron] Refunding ${backers.length} backers for "${campaign.title}"`);

        // Build multicall: one transfer per backer
        const calls = backers.map((b) => ({
          contractAddress: STRK_ADDRESS,
          entrypoint: "transfer",
          calldata: [
            b.backer_address,
            ...uint256.bnToUint256(BigInt(Math.round(b.amount * 1e18))),
          ],
        }));

        // Execute batch refund — all backers in one tx
        const tx = await platformAccount.execute(calls);
        await provider.waitForTransaction(tx.transaction_hash);

        console.log(`[refund-cron] ✅ Refund tx: ${tx.transaction_hash}`);

        // Mark everything as refunded in DB
        const markContrib = db.prepare(
          "UPDATE contributions SET refunded = 1, refund_tx_hash = ? WHERE id = ?"
        );

        db.transaction(() => {
          for (const b of backers) {
            markContrib.run(tx.transaction_hash, b.id);
          }
          db.prepare(
            "UPDATE campaigns SET status = 'refunded', refunded = 1, refunded_at = ?, refund_tx = ?, raised = 0 WHERE id = ?"
          ).run(now, tx.transaction_hash, campaign.id);
        })();

        console.log(`[refund-cron] ✅ Refunded "${campaign.title}" — ${backers.length} backers`);
      } catch (err) {
        console.error(`[refund-cron] ❌ Refund failed for "${campaign.title}":`, err.message);
        // Don't mark as refunded — will retry next hour
      }
    }
  };

  // Run immediately on startup
  checkAndRefund();

  // Then every hour
  setInterval(checkAndRefund, REFUND_CHECK_INTERVAL);
}