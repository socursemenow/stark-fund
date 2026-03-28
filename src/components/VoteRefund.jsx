// ─────────────────────────────────────────────────────────
// src/components/VoteRefund.jsx
// Backers vote for early refund. >50% triggers refund.
// Uses server /vote endpoint (UNIQUE constraint = 1 vote per backer)
// Sends 0.001 STRK proof tx on-chain via voteRefund()
// ─────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useWallet, useWalletStore } from "../hooks/useWallet";
import { useCampaignStore } from "../hooks/useCampaigns";
import { getExplorerUrl } from "../hooks/useStarkzap";
import { api } from "../lib/api";

// Helper: get address from backer (server=backer_address, local=address)
const backerAddr = (b) => (b.backer_address || b.address || "").toLowerCase();

export default function VoteRefund({ campaign }) {
  const [voting, setVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [voteData, setVoteData] = useState(null);
  const [refunding, setRefunding] = useState(false);
  const [refundTx, setRefundTx] = useState(null);
  const [lastTxHash, setLastTxHash] = useState(null);

  const address = useWalletStore((s) => s.address);
  const { voteRefund, batchRefund, connected } = useWallet();
  const campaigns = useCampaignStore((s) => s.campaigns);
  const setCampaigns = useCampaignStore((s) => s.setCampaigns);
  const markRefunded = useCampaignStore((s) => s.markRefunded);

  const c = campaign;
  const addrStr = (typeof address === "string" ? address : address?.toString?.() || "").toLowerCase();

  // ── Fetch vote status from server on mount ──
  useEffect(() => {
    if (!c?.id) return;
    api.getVoteStatus(c.id)
      .then((data) => {
        setVoteData(data);
        // Check if current user already voted
        if (addrStr && data.votes) {
          const alreadyVoted = data.votes.some(
            (v) => (v.voter_address || v.voter || "").toLowerCase() === addrStr
          );
          setHasVoted(alreadyVoted);
        }
      })
      .catch(() => {
        // Server offline — fall back to local data
        setVoteData(null);
      });
  }, [c?.id, addrStr, lastTxHash]);

  if (!c || !c.backers || c.backers.length === 0) return null;

  // Check if current user is a backer
  const isBacker = c.backers.some(
    (b) => backerAddr(b) && addrStr && backerAddr(b) === addrStr
  );

  // Campaign must be active (not funded, not refunded)
  const expired = new Date(c.deadline) < new Date();
  const funded = c.raised >= c.goal;
  if (funded || c.refunded) return null;

  // Show refund tx if already refunded
  const existingTx = c.refund_tx_hash || c.refund_tx;

  // Vote counts — use server vote count but ALWAYS compute threshold locally
  const votes = voteData?.voteCount ?? c.voteCount ?? c.refund_votes ?? 0;
  const backerCount = c.backers.length; // always use actual backer array length
  // >50% means: 1 backer needs 1 vote, 2 need 2, 3 need 2, 4 need 3, etc.
  const threshold = Math.floor(backerCount / 2) + 1;
  const pct = backerCount > 0 ? Math.round((votes / backerCount) * 100) : 0;
  const thresholdMet = votes >= threshold;

  // ── Handle vote — sends 0.001 STRK proof tx + records on server ──
  const handleVote = async () => {
    if (!isBacker || hasVoted || !connected) return;
    setVoting(true);

    try {
      const result = await voteRefund(c.id);

      if (result) {
        setHasVoted(true);
        setLastTxHash(result.txHash);

        if (result.refundTriggered || votes + 1 >= threshold) {
          // Vote threshold crossed — trigger batch refund
          await executeRefund();
        }
      }
    } catch (err) {
      if (err?.message?.includes("already voted") || err?.message?.includes("UNIQUE")) {
        setHasVoted(true);
        toast("You already voted!", { icon: "🗳️" });
      } else {
        console.error("Vote failed:", err);
        toast.error("Vote failed");
      }
    }
    setVoting(false);
  };

  // ── Execute batch refund when threshold is met ──
  const executeRefund = async () => {
    if (!connected || c.backers.length === 0) return;
    setRefunding(true);

    try {
      const recipients = c.backers
        .filter((b) => backerAddr(b) && (b.amount > 0) && !b.refunded)
        .map((b) => ({
          address: b.backer_address || b.address,
          amount: b.amount,
        }));

      if (recipients.length === 0) {
        toast.error("No backers to refund");
        setRefunding(false);
        return;
      }

      const tx = await batchRefund(recipients);
      const hash = tx.hash || tx.transaction_hash || "";
      const explorerUrl = tx.explorerUrl || getExplorerUrl(hash);

      setRefundTx({ hash, explorerUrl });

      setCampaigns(
        campaigns.map((camp) =>
          camp.id === c.id
            ? {
                ...camp,
                refunded: true,
                refund_tx_hash: hash,
                refund_explorer_url: explorerUrl,
                refunded_at: new Date().toISOString(),
              }
            : camp
        )
      );

      try {
        if (markRefunded) await markRefunded(c.id);
      } catch (e) {
        console.warn("markRefunded API call failed:", e.message);
      }

      toast.success(`Refunded ${recipients.length} backers!`, { duration: 5000 });
    } catch (err) {
      console.error("Refund tx failed:", err);
      toast.error("Refund transaction failed: " + (err.message || "Unknown error"));
    }
    setRefunding(false);
  };

  return (
    <div style={{
      padding: "16px 18px", borderRadius: 14, marginTop: 16,
      background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#f5f3fa" }}>
          🗳️ Request Refund
        </h4>
        <span style={{ fontSize: 12, color: "#8a8498" }}>
          {votes} / {threshold} votes needed
        </span>
      </div>

      <p style={{ fontSize: 12, color: "#8a8498", margin: "0 0 12px", lineHeight: 1.5 }}>
        If the founder is unresponsive, backers can vote for an early refund. When more than 50% of backers vote, all funds are returned automatically via a single batch transaction.
        Each backer gets exactly one vote.
      </p>

      {/* Vote progress bar */}
      <div style={{ width: "100%", height: 6, borderRadius: 6, background: "rgba(239,68,68,0.1)", marginBottom: 10 }}>
        <div style={{
          width: `${Math.min((votes / Math.max(threshold, 1)) * 100, 100)}%`,
          height: "100%", borderRadius: 6,
          background: thresholdMet
            ? "linear-gradient(90deg,#ef4444,#f87171)"
            : "linear-gradient(90deg,#f59e0b,#fbbf24)",
          transition: "width 0.5s ease",
        }} />
      </div>

      {/* Refund in progress */}
      {refunding && (
        <div style={{
          padding: "12px 16px", borderRadius: 12, marginBottom: 10,
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ width: 18, height: 18, border: "2px solid #ef4444", borderTopColor: "transparent", borderRadius: "50%", animation: "sp .8s linear infinite", flexShrink: 0 }} />
          <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
          <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 600 }}>
            Executing batch refund on Starknet...
          </span>
        </div>
      )}

      {/* Refund completed — show tx link */}
      {(refundTx || existingTx) && (
        <a
          href={refundTx?.explorerUrl || c.refund_explorer_url || getExplorerUrl(existingTx)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block", padding: "10px 14px", borderRadius: 10, marginBottom: 10,
            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)",
            textDecoration: "none",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, margin: "0 0 2px" }}>
                💸 Refund executed onchain
              </p>
              <p style={{ fontSize: 11, color: "#22c55e", margin: 0, fontFamily: "monospace", opacity: 0.7 }}>
                tx: {(refundTx?.hash || existingTx || "").slice(0, 20)}...
              </p>
            </div>
            <span style={{ fontSize: 12, color: "#22c55e" }}>View on Voyager ↗</span>
          </div>
        </a>
      )}

      {/* Vote button row */}
      {!refundTx && !existingTx && !refunding && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: thresholdMet ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>
            {pct}% of backers voted
          </span>

          {isBacker && !hasVoted ? (
            <button
              onClick={handleVote}
              disabled={voting || !connected}
              style={{
                padding: "8px 18px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 600,
                color: "#fff", background: "linear-gradient(135deg,#dc2626,#ef4444)",
                cursor: voting || !connected ? "not-allowed" : "pointer",
                opacity: voting || !connected ? 0.5 : 1,
                fontFamily: "inherit", boxShadow: "0 2px 10px rgba(239,68,68,0.2)",
              }}
            >
              {voting ? "Voting..." : "Vote for Refund"}
            </button>
          ) : isBacker && hasVoted ? (
            <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>✓ You voted</span>
          ) : (
            <span style={{ fontSize: 11, color: "#5c5672" }}>Only backers can vote</span>
          )}
        </div>
      )}

      {/* Tx link from vote */}
      {lastTxHash && !refundTx && !existingTx && (
        <a
          href={getExplorerUrl(lastTxHash)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block", textAlign: "center", marginTop: 8,
            fontSize: 11, color: "#5c5672", textDecoration: "none", fontFamily: "monospace",
          }}
        >
          vote tx: {lastTxHash.slice(0, 14)}... · Voyager ↗
        </a>
      )}
    </div>
  );
}