// ─────────────────────────────────────────────────────────
// src/components/FundModal.jsx
// REAL funding flow — validates deadline, overfund, status
// Sends STRK to campaign wallet via wallet.transfer()
// ─────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useWallet } from "../hooks/useWallet";
import { useCampaignStore } from "../hooks/useCampaigns";
import { getExplorerUrl } from "../hooks/useStarkzap";

export default function FundModal({ open, onClose, campaign }) {
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("STRK");
  const [step, setStep] = useState(0); // 0=input, 1=processing, 2=success, 3=error
  const [quote, setQuote] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [explorerUrl, setExplorerUrl] = useState(null);
  const [feeAmount, setFeeAmount] = useState(null);
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");

  const { transfer, swapAndTransfer, getQuote, address, connected } = useWallet();
  const { recordFund } = useCampaignStore();

  const parsedAmt = parseFloat(amount) || 0;

  // ── Campaign validation ──
  const isExpired = campaign ? new Date(campaign.deadline) < new Date() : false;
  const isFunded = campaign ? campaign.raised >= campaign.goal : false;
  const isRefunded = campaign ? (campaign.refunded || campaign.status === "refunded") : false;
  const remaining = campaign ? Math.max(0, campaign.goal - campaign.raised) : 0;
  const canFund = !isExpired && !isFunded && !isRefunded && remaining > 0;

  // Cap amount to remaining goal
  const effectiveAmount = Math.min(parsedAmt, remaining);
  const isCapped = parsedAmt > remaining && remaining > 0;

  // Debounced quote fetch
  useEffect(() => {
    if (token === "STRK" || parsedAmt <= 0) { setQuote(null); return; }
    const t = setTimeout(async () => {
      try {
        const q = await getQuote(token, amount);
        setQuote(q);
      } catch { setQuote(null); }
    }, 500);
    return () => clearTimeout(t);
  }, [token, amount]);

  const handleFund = async () => {
    // ── Frontend validation ──
    if (parsedAmt <= 0) return toast.error("Enter an amount");
    if (!canFund) return toast.error("This campaign is no longer accepting funds");
    if (isExpired) return toast.error("Campaign deadline has passed");
    if (isFunded) return toast.error("Campaign goal already reached");
    if (remaining <= 0) return toast.error("Campaign is fully funded");

    // Use capped amount (don't overfund)
    const fundAmount = effectiveAmount;

    if (isCapped) {
      toast(`Amount capped to ${remaining.toFixed(2)} STRK (remaining goal)`, { icon: "⚠️" });
    }

    setStep(1);
    setError(null);

    try {
      let result, strkAmount;

      if (token === "STRK") {
        setStatusMsg("Transferring STRK to campaign...");
        result = await transfer(campaign.wallet_address, String(fundAmount));
        strkAmount = fundAmount;
      } else {
        setStatusMsg(`Swapping ${token} → STRK...`);
        const swapResult = await swapAndTransfer(token, String(fundAmount), campaign.wallet_address);
        result = { tx: swapResult.transferTx, feeAmount: null };
        strkAmount = parseFloat(swapResult.strkReceived || fundAmount);
      }

      const tx = result.tx || result;
      const hash = tx.hash || tx.transaction_hash || "0x...";
      const explorer = tx.explorerUrl || getExplorerUrl(hash);
      setTxHash(hash);
      setExplorerUrl(explorer);
      setFeeAmount(result.feeAmount || null);

      // Record in store/backend
      await recordFund(campaign.id, {
        address: address,
        amount: Math.round(strkAmount),
        token_paid: token,
        amount_paid: parsedAmt,
        tx_hash: hash,
      });

      setTxHash(hash);
      setStep(2);
      toast.success(`Backed ${campaign.title} with ${strkAmount.toFixed(1)} STRK!`);
    } catch (err) {
      console.error("Fund failed:", err);
      setError(err.message || "Transaction failed");
      setStep(3);
      toast.error("Transaction failed");
    }
  };

  const reset = () => { setAmount(""); setToken("STRK"); setStep(0); setQuote(null); setTxHash(null); setExplorerUrl(null); setFeeAmount(null); setError(null); setStatusMsg(""); };
  const handleClose = () => { reset(); onClose(); };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", background: "rgba(20,16,28,0.95)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 28, maxWidth: 440, width: "100%" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f5f3fa" }}>
            {step === 2 ? "Contribution Sent!" : step === 3 ? "Transaction Failed" : `Fund ${campaign?.title}`}
          </h3>
          <button onClick={handleClose} style={{ background: "none", border: "none", color: "#5c5672", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        {/* INPUT */}
        {step === 0 && (
          <>
            {/* Campaign status warnings */}
            {isExpired && (
              <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, marginBottom: 14, fontSize: 13, color: "#ef4444" }}>
                ⏰ Campaign deadline has passed. Funding is closed.
              </div>
            )}
            {isFunded && !isExpired && (
              <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 10, marginBottom: 14, fontSize: 13, color: "#22c55e" }}>
                ✅ Campaign goal already reached!
              </div>
            )}
            {isRefunded && (
              <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, marginBottom: 14, fontSize: 13, color: "#ef4444" }}>
                💸 Campaign has been refunded. Cannot accept new funds.
              </div>
            )}

            {!connected && (
              <div style={{ padding: "10px 14px", background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.15)", borderRadius: 10, marginBottom: 14, fontSize: 13, color: "#f97316" }}>
                Sign in first to fund this project
              </div>
            )}

            {/* Remaining goal indicator */}
            {canFund && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8a8498", marginBottom: 10, padding: "8px 12px", background: "rgba(7,6,11,0.4)", borderRadius: 8 }}>
                <span>Remaining to goal</span>
                <span style={{ color: "#f97316", fontWeight: 700 }}>{remaining.toLocaleString()} STRK</span>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8a8498", marginBottom: 6 }}>Pay with</label>
              <div style={{ display: "flex", gap: 6 }}>
                {["STRK", "USDC", "ETH"].map((t) => (
                  <button key={t} onClick={() => setToken(t)} disabled={!canFund} style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: canFund ? "pointer" : "not-allowed", fontFamily: "inherit",
                    border: token === t ? "1px solid #f97316" : "1px solid rgba(255,255,255,0.06)",
                    background: token === t ? "rgba(249,115,22,0.12)" : "rgba(7,6,11,0.6)",
                    color: token === t ? "#f97316" : "#8a8498",
                    opacity: canFund ? 1 : 0.5,
                  }}>{t}</button>
                ))}
              </div>
              {token !== "STRK" && <p style={{ fontSize: 11, color: "#5c5672", marginTop: 6 }}>Auto-swapped to STRK via wallet.swap()</p>}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#8a8498" }}>Amount</label>
                {canFund && (
                  <button
                    onClick={() => setAmount(String(remaining))}
                    style={{ fontSize: 11, fontWeight: 700, color: "#f97316", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    MAX: {remaining.toLocaleString()} STRK
                  </button>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#5c5672", fontSize: 14 }}>
                  {token === "STRK" ? "◆" : token === "USDC" ? "$" : "Ξ"}
                </span>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                  disabled={!canFund}
                  max={remaining}
                  style={{ width: "100%", background: "rgba(7,6,11,0.6)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 10px 10px 40px", color: "#e8e4ef", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box", opacity: canFund ? 1 : 0.5 }}
                />
              </div>
            </div>

            {/* Overfund warning */}
            {isCapped && (
              <div style={{ padding: "8px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 10, marginBottom: 14, fontSize: 12, color: "#f59e0b" }}>
                ⚠️ Amount exceeds remaining goal. Will be capped to {remaining.toFixed(2)} STRK.
              </div>
            )}

            {parsedAmt > 0 && canFund && (
              <div style={{ padding: "12px 14px", background: "rgba(7,6,11,0.5)", borderRadius: 10, marginBottom: 14, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498", marginBottom: 6 }}>
                  <span>You send</span><span style={{ color: "#e8e4ef", fontWeight: 600 }}>{effectiveAmount.toFixed(2)} {token}</span>
                </div>
                {token !== "STRK" && quote && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498", marginBottom: 6 }}>
                    <span>Project receives</span><span style={{ color: "#e8e4ef", fontWeight: 600 }}>≈ {quote.amountOut} STRK</span>
                  </div>
                )}
                {token !== "STRK" && quote && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498", marginBottom: 6 }}>
                    <span>Route</span><span style={{ color: "#8a8498" }}>{quote.provider} · {quote.priceImpact}% impact</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498" }}>
                  <span>Gas fee</span><span style={{ color: "#22c55e", fontWeight: 600 }}>$0.00 (sponsored)</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498", marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <span>Platform fee (1.5%)</span><span style={{ color: "#8a8498" }}>{(effectiveAmount * 0.015).toFixed(4)} {token}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#f97316", marginTop: 4 }}>
                  <span>Campaign receives</span><span style={{ fontWeight: 600 }}>{(effectiveAmount * 0.985).toFixed(4)} {token}</span>
                </div>
                {/* After funding: remaining */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498", marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <span>After this contribution</span>
                  <span style={{ color: (remaining - effectiveAmount) <= 0 ? "#22c55e" : "#8a8498", fontWeight: 600 }}>
                    {(remaining - effectiveAmount) <= 0 ? "🎉 Goal met!" : `${(remaining - effectiveAmount).toFixed(2)} STRK remaining`}
                  </span>
                </div>
              </div>
            )}

            <button onClick={handleFund} disabled={parsedAmt <= 0 || !connected || !canFund}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 12, border: "none", fontWeight: 600, fontSize: 14,
                color: "#fff", background: "linear-gradient(135deg,#f97316,#ea580c)",
                cursor: parsedAmt <= 0 || !connected || !canFund ? "not-allowed" : "pointer",
                opacity: parsedAmt <= 0 || !connected || !canFund ? 0.4 : 1,
                boxShadow: "0 2px 16px rgba(249,115,22,0.3)", fontFamily: "inherit",
              }}>
              {!canFund ? (isExpired ? "Campaign Expired" : isFunded ? "Goal Reached" : "Cannot Fund") : "Confirm Contribution"}
            </button>
            <p style={{ fontSize: 11, color: "#5c5672", textAlign: "center", marginTop: 10 }}>Gasless via Cartridge Controller on Starknet</p>
          </>
        )}

        {/* PROCESSING */}
        {step === 1 && (
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #f97316", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 18px", animation: "sp .8s linear infinite" }} />
            <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
            <p style={{ color: "#e8e4ef", fontWeight: 600, fontSize: 15, margin: "0 0 8px" }}>Processing on Starknet...</p>
            <p style={{ color: "#f97316", fontSize: 13, margin: "0 0 18px" }}>{statusMsg}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
              {[token !== "STRK" && `Swapping ${token} → STRK via wallet.swap()`, "Transferring to campaign via wallet.transfer()", "Waiting for confirmation..."].filter(Boolean).map((s, i) => (
                <div key={i} style={{ fontSize: 13, color: "#8a8498", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#22c55e" }}>✓</span> {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {step === 2 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(249,115,22,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24 }}>⚡</div>
            <p style={{ color: "#f97316", fontWeight: 700, fontSize: 18, margin: "0 0 4px", textShadow: "0 0 20px rgba(249,115,22,0.3)" }}>You backed {campaign?.title}!</p>
            <p style={{ color: "#8a8498", fontSize: 14, margin: "0 0 18px" }}>
              {effectiveAmount.toFixed(1)} {token} contributed · 0 gas fees
              {feeAmount && <span style={{ display: "block", fontSize: 12, marginTop: 4, color: "#5c5672" }}>Platform fee: {feeAmount}</span>}
            </p>
            {txHash && (
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", padding: "10px 14px", background: "rgba(34,197,94,0.1)", borderRadius: 10, marginBottom: 18, wordBreak: "break-all", textDecoration: "none" }}>
                <p style={{ fontSize: 12, color: "#22c55e", margin: "0 0 4px", fontFamily: "monospace" }}>tx: {txHash}</p>
                <p style={{ fontSize: 11, color: "#22c55e", margin: 0, opacity: 0.7 }}>View on Voyager ↗</p>
              </a>
            )}
            <button onClick={handleClose} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)", color: "#8a8498", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
          </div>
        )}

        {/* ERROR */}
        {step === 3 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24 }}>✕</div>
            <p style={{ color: "#ef4444", fontWeight: 700, fontSize: 16, margin: "0 0 4px" }}>Transaction Failed</p>
            <p style={{ color: "#8a8498", fontSize: 13, margin: "0 0 18px", maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>{error}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep(0)} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)", color: "#8a8498", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Try Again</button>
              <button onClick={handleClose} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#f97316,#ea580c)", color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}