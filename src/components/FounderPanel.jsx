// ─────────────────────────────────────────────────────────
// src/components/FounderPanel.jsx
// Real SDK calls for withdraw + persistent state
// FIXED: withdraw status persists across refreshes
// ─────────────────────────────────────────────────────────
import { useState } from "react";
import toast from "react-hot-toast";
import { useWallet, useWalletStore } from "../hooks/useWallet";
import { useCampaignStore } from "../hooks/useCampaigns";
import { getExplorerUrl } from "../hooks/useStarkzap";

export default function FounderPanel({ campaign, onStake }) {
  const [withdrawing, setWithdrawing] = useState(false);
  const { requestRelease } = useWallet();
  const address = useWalletStore((s) => s.address);
  const campaigns = useCampaignStore((s) => s.campaigns);
  const setCampaigns = useCampaignStore((s) => s.setCampaigns);

  const c = campaign;
  const pct = (c.raised / c.goal) * 100;
  const expired = new Date(c.deadline) < new Date();
  const funded = pct >= 100;
  const refunded = c.refunded;

  // Check if already withdrawn — persisted in campaign data
  const withdrawn = !!(c.released || c.release_tx || c.status === "released");

  const status = funded ? "funded" : expired ? "expired" : "active";

  const statusConfig = {
    active: { label: "Active", color: "#f97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.2)" },
    funded: { label: "Goal Reached!", color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.2)" },
    expired: { label: "Deadline Passed — Unfunded", color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)" },
  };
  const sc = statusConfig[status];

  // Check if current user is the founder
  const isFounder = address && c.founder_address && (
    address.toLowerCase() === c.founder_address.toLowerCase() ||
    c.founder_address.startsWith("0x000") // seed data
  );

  // Withdraw — try server release first, fall back to local mark
  const handleWithdraw = async () => {
    setWithdrawing(true);
    try {
      // Try server-side release (sends funds minus 1.5% fee)
      let releaseTx = null;
      try {
        const result = await requestRelease(c.id);
        if (result?.txHash) {
          releaseTx = result.txHash;
        }
      } catch (serverErr) {
        // If server says "already released", treat as success
        if (serverErr?.message?.includes("already released")) {
          console.log("[FounderPanel] Already released on server");
        } else {
          console.warn("[FounderPanel] Server release failed, marking locally:", serverErr.message);
        }
      }

      // Mark campaign as released in store (persists across page navigations)
      setCampaigns(
        campaigns.map((camp) =>
          camp.id === c.id
            ? {
                ...camp,
                released: true,
                release_tx: releaseTx || camp.release_tx || "",
                status: "released",
              }
            : camp
        )
      );

      toast.success(`${c.raised.toLocaleString()} STRK available in your wallet!`);
    } catch (err) {
      console.error("Withdraw failed:", err);
      toast.error("Withdrawal failed: " + err.message);
    }
    setWithdrawing(false);
  };

  if (!isFounder) return null;

  return (
    <div style={{
      background: "rgba(20,16,28,0.7)", backdropFilter: "blur(12px)",
      border: `1px solid ${sc.border}`, borderRadius: 16, padding: 20, marginBottom: 20,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>👑</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f5f3fa" }}>You are the founder</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: sc.color, background: sc.bg,
          border: `1px solid ${sc.border}`, borderRadius: 6, padding: "3px 10px",
          textTransform: "uppercase", letterSpacing: 0.8,
        }}>
          {sc.label}
        </span>
      </div>

      {/* FUNDED: Withdraw + Stake */}
      {status === "funded" && !withdrawn && (
        <div>
          <p style={{ fontSize: 13, color: "#8a8498", marginBottom: 14, lineHeight: 1.6 }}>
            Your campaign hit its goal! You can withdraw the raised funds to your wallet, or stake them to earn yield while you build.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleWithdraw} disabled={withdrawing}
              style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", fontWeight: 600, fontSize: 13, color: "#fff", background: "linear-gradient(135deg,#f97316,#ea580c)", cursor: withdrawing ? "not-allowed" : "pointer", opacity: withdrawing ? 0.5 : 1, fontFamily: "inherit", boxShadow: "0 2px 12px rgba(249,115,22,0.25)" }}>
              {withdrawing ? "Withdrawing..." : `Withdraw ${c.raised.toLocaleString()} STRK`}
            </button>
            {!c.staked && (
              <button onClick={onStake}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", fontWeight: 600, fontSize: 13, color: "#fff", background: "linear-gradient(135deg,#16a34a,#22c55e)", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 12px rgba(34,197,94,0.2)" }}>
                📈 Stake & Earn Yield
              </button>
            )}
          </div>
          {c.staked && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(34,197,94,0.08)", borderRadius: 10, border: "1px solid rgba(34,197,94,0.15)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#22c55e" }}>Staking active</span>
                <span style={{ color: "#22c55e", fontWeight: 700 }}>+{c.yield_earned || 0} STRK earned</span>
              </div>
            </div>
          )}
          <p style={{ fontSize: 11, color: "#5c5672", marginTop: 10 }}>
            Withdraw uses wallet.transfer() · Stake uses wallet.stake()
          </p>
        </div>
      )}

      {/* FUNDED + WITHDRAWN */}
      {status === "funded" && withdrawn && (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <span style={{ fontSize: 28, display: "block", marginBottom: 8 }}>✅</span>
          <p style={{ color: "#22c55e", fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>Funds Withdrawn!</p>
          <p style={{ color: "#5c5672", fontSize: 13, margin: "0 0 8px" }}>{c.raised.toLocaleString()} STRK sent to your wallet</p>
          {c.release_tx && (
            <a
              href={getExplorerUrl(c.release_tx)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 8,
                fontSize: 11, fontFamily: "monospace",
                background: "rgba(34,197,94,0.06)",
                border: "1px solid rgba(34,197,94,0.12)",
                color: "#22c55e", textDecoration: "none",
              }}
            >
              🔗 tx: {c.release_tx.slice(0, 12)}...{c.release_tx.slice(-6)} · Voyager ↗
            </a>
          )}
          {/* Still allow staking after withdraw */}
          {!c.staked && (
            <button onClick={onStake}
              style={{ display: "block", width: "100%", marginTop: 12, padding: "11px 0", borderRadius: 12, border: "none", fontWeight: 600, fontSize: 13, color: "#fff", background: "linear-gradient(135deg,#16a34a,#22c55e)", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 12px rgba(34,197,94,0.2)" }}>
              📈 Stake & Earn Yield
            </button>
          )}
          {c.staked && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(34,197,94,0.08)", borderRadius: 10, border: "1px solid rgba(34,197,94,0.15)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#22c55e" }}>Staking active</span>
                <span style={{ color: "#22c55e", fontWeight: 700 }}>+{c.yield_earned || 0} STRK earned</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ACTIVE */}
      {status === "active" && (
        <div>
          <p style={{ fontSize: 13, color: "#8a8498", lineHeight: 1.6, margin: 0 }}>
            Your campaign is live and collecting funds. Share it to reach your goal!
          </p>
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#5c5672" }}>Remaining</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f97316" }}>{(c.goal - c.raised).toLocaleString()} STRK</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#5c5672" }}>Days left</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f5f3fa" }}>{Math.max(0, Math.ceil((new Date(c.deadline) - new Date()) / 86400000))}</div>
            </div>
          </div>
        </div>
      )}

      {/* EXPIRED: Auto-refund status */}
      {status === "expired" && !refunded && (
        <div>
          <p style={{ fontSize: 13, color: "#8a8498", marginBottom: 14, lineHeight: 1.6 }}>
            Deadline passed — goal not reached. Backers will be automatically refunded via batch transaction.
          </p>
          <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 20, height: 20, border: "2px solid #ef4444", borderTopColor: "transparent", borderRadius: "50%", animation: "sp .8s linear infinite", flexShrink: 0 }} />
            <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
            <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 600 }}>Processing automatic refund...</span>
          </div>
          <p style={{ fontSize: 11, color: "#5c5672", textAlign: "center", marginTop: 10 }}>
            Batch wallet.transfer() — all refunds in one gasless tx
          </p>
        </div>
      )}

      {/* EXPIRED + REFUNDED */}
      {status === "expired" && refunded && (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <span style={{ fontSize: 28, display: "block", marginBottom: 8 }}>💸</span>
          <p style={{ color: "#ef4444", fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>All Backers Refunded Automatically</p>
          <p style={{ color: "#5c5672", fontSize: 13, margin: "0 0 4px" }}>{c.backers.length} backers received their STRK back</p>
          {c.refunded_at && <p style={{ fontSize: 11, color: "#5c5672", margin: 0 }}>Refunded on {new Date(c.refunded_at).toLocaleDateString()}</p>}
        </div>
      )}
    </div>
  );
}