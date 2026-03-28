// ─────────────────────────────────────────────────────────
// src/components/StakeModal.jsx
// REAL staking via wallet.stake()
// ─────────────────────────────────────────────────────────
import { useState } from "react";
import toast from "react-hot-toast";
import { useWallet } from "../hooks/useWallet";
import { useCampaignStore } from "../hooks/useCampaigns";
import { getExplorerUrl } from "../hooks/useStarkzap";
export default function StakeModal({ open, onClose, campaign }) {
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState(0);
  const [txHash, setTxHash] = useState(null);
  const [explorerUrl, setExplorerUrl] = useState(null);
  const [error, setError] = useState(null);

  const { stake, connected } = useWallet();
  const { markStaked } = useCampaignStore();

  const available = campaign ? campaign.raised : 0;
  const parsedAmt = parseFloat(amount) || 0;
  const apr = 7.2;

  const handleStake = async () => {
    if (parsedAmt <= 0 || parsedAmt > available) return;
    setStep(1);
    setError(null);

    try {
      const tx = await stake(amount);
      const hash = tx.hash || tx.transaction_hash || "0x...";
      const explorer = tx.explorerUrl || getExplorerUrl(hash);
      setTxHash(hash);
      setExplorerUrl(explorer);

      // Update campaign in store + backend
      if (campaign.id !== "wallet") {
        await markStaked(campaign.id, hash);
      }

      setStep(2);
      toast.success(`Staked ${parsedAmt} STRK!`);
    } catch (err) {
      console.error("Stake failed:", err);
      setError(err.message || "Staking failed");
      setStep(3);
      toast.error("Staking failed");
    }
  };

  const handleMax = () => setAmount(String(available));
  const reset = () => { setAmount(""); setStep(0); setTxHash(null); setExplorerUrl(null); setError(null); };
  const handleClose = () => { reset(); onClose(); };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", background: "rgba(20,16,28,0.95)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 28, maxWidth: 420, width: "100%" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f5f3fa" }}>
            {step === 2 ? "Staking Active!" : step === 3 ? "Staking Failed" : "Stake STRK"}
          </h3>
          <button onClick={handleClose} style={{ background: "none", border: "none", color: "#5c5672", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        {/* INPUT */}
        {step === 0 && (
          <>
            <div style={{ padding: "14px 16px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 12, marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#22c55e" }}>Starknet Staking APR</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>~{apr}%</span>
              </div>
              <p style={{ fontSize: 12, color: "#8a8498", margin: 0, lineHeight: 1.5 }}>
                Delegate STRK to Starknet validators. Earn yield while you build — unstake anytime.
              </p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#8a8498" }}>Amount</label>
                <button onClick={handleMax} style={{ fontSize: 11, fontWeight: 700, color: "#f97316", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  MAX: {available.toLocaleString()} STRK
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#5c5672" }}>◆</span>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                  style={{ width: "100%", background: "rgba(7,6,11,0.6)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 10px 10px 40px", color: "#e8e4ef", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>

            {parsedAmt > 0 && (
              <div style={{ padding: "12px 14px", background: "rgba(7,6,11,0.5)", borderRadius: 10, marginBottom: 14, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498", marginBottom: 6 }}>
                  <span>You stake</span><span style={{ color: "#e8e4ef", fontWeight: 600 }}>{parsedAmt.toLocaleString()} STRK</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498", marginBottom: 6 }}>
                  <span>Est. monthly yield</span><span style={{ color: "#22c55e", fontWeight: 600 }}>+{((parsedAmt * apr) / 100 / 12).toFixed(1)} STRK</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498" }}>
                  <span>Est. yearly yield</span><span style={{ color: "#22c55e", fontWeight: 600 }}>+{((parsedAmt * apr) / 100).toFixed(1)} STRK</span>
                </div>
              </div>
            )}

            <button onClick={handleStake} disabled={parsedAmt <= 0 || parsedAmt > available || !connected}
              style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", fontWeight: 600, fontSize: 14, color: "#fff", background: "linear-gradient(135deg,#16a34a,#22c55e)", cursor: parsedAmt <= 0 || !connected ? "not-allowed" : "pointer", opacity: parsedAmt <= 0 || parsedAmt > available || !connected ? 0.4 : 1, boxShadow: "0 2px 16px rgba(34,197,94,0.25)", fontFamily: "inherit" }}>
              Stake STRK
            </button>
            <p style={{ fontSize: 11, color: "#5c5672", textAlign: "center", marginTop: 10 }}>Delegated via wallet.stake() · gasless</p>
          </>
        )}

        {/* PROCESSING */}
        {step === 1 && (
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #22c55e", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 18px", animation: "sp .8s linear infinite" }} />
            <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
            <p style={{ color: "#e8e4ef", fontWeight: 600, fontSize: 15, margin: "0 0 18px" }}>Staking on Starknet...</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
              {["Delegating STRK to validator pool via wallet.stake()", "Confirming delegation on Starknet", "Activating yield accrual"].map((s, i) => (
                <div key={i} style={{ fontSize: 13, color: "#8a8498", display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "#22c55e" }}>✓</span> {s}</div>
              ))}
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {step === 2 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24 }}>📈</div>
            <p style={{ color: "#22c55e", fontWeight: 700, fontSize: 18, margin: "0 0 4px" }}>Staking Active!</p>
            <p style={{ color: "#8a8498", fontSize: 14, margin: "0 0 8px" }}>{parsedAmt.toLocaleString()} STRK at ~{apr}% APR</p>
            {txHash && <a href={explorerUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontSize: 11, color: "#22c55e", fontFamily: "monospace", margin: "0 0 18px", wordBreak: "break-all", textDecoration: "none" }}>tx: {txHash} · View on Voyager ↗</a>}
            <button onClick={handleClose} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)", color: "#8a8498", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
          </div>
        )}

        {/* ERROR */}
        {step === 3 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24 }}>✕</div>
            <p style={{ color: "#ef4444", fontWeight: 700, fontSize: 16, margin: "0 0 4px" }}>Staking Failed</p>
            <p style={{ color: "#8a8498", fontSize: 13, margin: "0 0 18px" }}>{error}</p>
            <button onClick={() => setStep(0)} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)", color: "#8a8498", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}