// ─────────────────────────────────────────────────────────
// src/hooks/useAutoRefund.js
// Auto-detects expired unfunded campaigns.
// If current user is the founder → executes real batch refund.
// Otherwise → marks as pending refund (founder must trigger).
// ─────────────────────────────────────────────────────────
import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useCampaignStore } from "./useCampaigns";
import { useWalletStore } from "./useWallet";

export function useAutoRefund() {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const setCampaigns = useCampaignStore((s) => s.setCampaigns);
  const wallet = useWalletStore((s) => s.wallet);
  const connected = useWalletStore((s) => s.connected);
  const address = useWalletStore((s) => s.address);
  const processed = useRef(new Set());

  useEffect(() => {
    const check = async () => {
      const now = new Date();
      const addrStr = (typeof address === "string" ? address : address?.toString?.() || "").toLowerCase();

      for (const c of campaigns) {
        const expired = new Date(c.deadline) < now;
        const funded = c.raised >= c.goal;
        const noBackers = !c.backers || c.backers.length === 0;

        // Also check vote threshold
        const voteThresholdMet = c.backers && c.backers.length > 0
          && (c.refund_votes || 0) > c.backers.length / 2;

        const shouldRefund = (expired && !funded) || voteThresholdMet;

        if (!shouldRefund || c.refunded || noBackers || processed.current.has(c.id)) {
          continue;
        }

        processed.current.add(c.id);

        // Check if current user is the founder (they have the funds)
        const founderStr = (typeof c.founder_address === "string"
          ? c.founder_address
          : c.founder_address?.toString?.() || "").toLowerCase();

        const isFounder = addrStr && founderStr && addrStr === founderStr;

        if (connected && wallet && isFounder) {
          // Founder is logged in → execute real batch refund
          try {
            const { Amount, fromAddress, getExplorerUrl } = await import("./useStarkzap");
            const tokens = useWalletStore.getState().tokens;

            if (tokens?.STRK) {
              const recipients = c.backers
                .filter((b) => b.address && b.amount > 0)
                .map((b) => ({
                  to: fromAddress(b.address),
                  amount: Amount.parse(String(b.amount), tokens.STRK),
                }));

              if (recipients.length > 0) {
                const tx = await wallet.transfer(tokens.STRK, recipients);
                const hash = tx.hash || tx.transaction_hash || "";
                const explorerUrl = tx.explorerUrl || getExplorerUrl(hash);
                await tx.wait();

                setCampaigns(
                  campaigns.map((camp) =>
                    camp.id === c.id
                      ? {
                          ...camp,
                          refunded: true,
                          refunded_at: now.toISOString(),
                          refund_tx_hash: hash,
                          refund_explorer_url: explorerUrl,
                        }
                      : camp
                  )
                );

                toast(
                  `💸 Auto-refunded ${c.backers.length} backers on "${c.title}"`,
                  { duration: 8000, style: { background: "#1a1020", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" } }
                );
                continue;
              }
            }
          } catch (err) {
            console.warn("Auto-refund tx failed:", err.message);
          }
        }

        // Not the founder, or tx failed → mark as needing refund
        // The founder will see a prompt to refund when they visit
        if (expired && !funded) {
          setCampaigns(
            campaigns.map((camp) =>
              camp.id === c.id
                ? { ...camp, refund_pending: true }
                : camp
            )
          );

          if (isFounder) {
            toast(
              `⚠️ "${c.title}" deadline passed — please refund backers`,
              { duration: 8000, style: { background: "#1a1020", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" } }
            );
          }
        }
      }
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [campaigns, setCampaigns, wallet, connected, address]);
}