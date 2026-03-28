// ─────────────────────────────────────────────────────────
// src/components/SwapModal.jsx
// Real token swap via wallet.swap() + wallet.getQuote()
// Providers: AVNU (aggregator) + Ekubo (AMM)
// FIXED: shows available balances + MAX button
// ─────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useWallet, useWalletStore } from "../hooks/useWallet";
import { Amount, formatBase, getExplorerUrl } from "../hooks/useStarkzap";

const TOKENS = [
  { symbol: "STRK", icon: "◆", color: "#f97316" },
  { symbol: "USDC", icon: "$", color: "#2775ca" },
  { symbol: "ETH", icon: "Ξ", color: "#627eea" },
];

export default function SwapModal({ open, onClose }) {
  const [from, setFrom] = useState("STRK");
  const [to, setTo] = useState("USDC");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState(0);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [explorerUrl, setExplorerUrl] = useState(null);
  const [error, setError] = useState(null);

  const { swap, refreshBalances, connected } = useWallet();
  const balances = useWalletStore((s) => s.balances);

  const parsedAmt = parseFloat(amount) || 0;
  const fromBalance = parseFloat(balances?.[from] || "0");
  const toBalance = parseFloat(balances?.[to] || "0");

  // Refresh balances when modal opens
  useEffect(() => {
    if (open && connected) refreshBalances();
  }, [open, connected]);

  // Fetch real quote with debounce
  useEffect(() => {
    if (parsedAmt <= 0 || from === to || !connected) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);

    const timer = setTimeout(async () => {
      try {
        const { wallet, tokens } = useWalletStore.getState();
        if (!wallet || !tokens) { setQuote(null); setQuoteLoading(false); return; }

        const fromToken = tokens[from];
        const toToken = tokens[to];
        if (!fromToken || !toToken) { setQuote(null); setQuoteLoading(false); return; }

        const amountIn = Amount.parse(amount, fromToken);

        let q = null;
        let usedProvider = null;

        for (const provider of ["avnu", "ekubo"]) {
          try {
            q = await wallet.getQuote({
              tokenIn: fromToken,
              tokenOut: toToken,
              amountIn,
              provider,
            });
            usedProvider = provider;
            break;
          } catch (err) {
            console.warn(`${provider} quote failed:`, err.message);
          }
        }

        if (q && usedProvider) {
          setQuote({
            amountOut: formatBase(q.amountOutBase, toToken),
            priceImpact: q.priceImpactBps ? Number(q.priceImpactBps) / 100 : 0,
            provider: usedProvider,
          });
        } else {
          setQuote(null);
        }
      } catch (err) {
        console.warn("All quote attempts failed:", err.message);
        setQuote(null);
      }
      setQuoteLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [from, to, amount, connected]);

  const flip = () => { setFrom(to); setTo(from); setAmount(""); setQuote(null); };

  const handleSwap = async () => {
    if (parsedAmt <= 0 || from === to || !connected) return;
    setStep(1);
    setError(null);

    try {
      const { wallet, tokens } = useWalletStore.getState();

      const tx = await wallet.swap({
        tokenIn: tokens[from],
        tokenOut: tokens[to],
        amountIn: Amount.parse(amount, tokens[from]),
        slippageBps: 100n,
        provider: quote?.provider || "avnu",
      });

      const hash = tx.hash || tx.transaction_hash || "0x...";
      const explorer = tx.explorerUrl || getExplorerUrl(hash);
      setTxHash(hash);
      setExplorerUrl(explorer);
      setStep(2);
      toast.success(`Swapped ${parsedAmt} ${from} → ${quote?.amountOut || "?"} ${to}`);

      // Refresh balances after swap
      refreshBalances();
    } catch (err) {
      console.error("Swap failed:", err);
      setError(err.message || "Swap failed");
      setStep(3);
      toast.error("Swap failed");
    }
  };

  const handleMax = () => setAmount(String(fromBalance));

  const reset = () => { setAmount(""); setStep(0); setQuote(null); setTxHash(null); setExplorerUrl(null); setError(null); };
  const handleClose = () => { reset(); onClose(); };

  if (!open) return null;

  const fromToken = TOKENS.find((t) => t.symbol === from);
  const toToken = TOKENS.find((t) => t.symbol === to);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", background: "rgba(20,16,28,0.95)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 28, maxWidth: 420, width: "100%" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f5f3fa" }}>
            {step === 2 ? "Swap Complete!" : step === 3 ? "Swap Failed" : "Swap Tokens"}
          </h3>
          <button onClick={handleClose} style={{ background: "none", border: "none", color: "#5c5672", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        {/* INPUT */}
        {step === 0 && (
          <>
            {/* From */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#8a8498" }}>From</label>
                <button
                  onClick={handleMax}
                  style={{ fontSize: 11, fontWeight: 700, color: fromToken.color, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Balance: {fromBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {from}
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, background: "rgba(7,6,11,0.6)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 14px" }}>
                <select value={from} onChange={(e) => setFrom(e.target.value)}
                  style={{ background: "transparent", border: "none", color: fromToken.color, fontSize: 15, fontWeight: 700, outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
                  {TOKENS.filter((t) => t.symbol !== to).map((t) => (
                    <option key={t.symbol} value={t.symbol} style={{ background: "#14102c" }}>{t.icon} {t.symbol}</option>
                  ))}
                </select>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                  style={{ flex: 1, background: "transparent", border: "none", color: "#e8e4ef", fontSize: 18, fontWeight: 700, textAlign: "right", outline: "none", fontFamily: "inherit" }} />
              </div>
              {parsedAmt > fromBalance && fromBalance > 0 && (
                <p style={{ fontSize: 11, color: "#ef4444", marginTop: 4, marginBottom: 0 }}>
                  Insufficient {from} balance
                </p>
              )}
            </div>

            {/* Flip */}
            <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
              <button onClick={flip} style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)", color: "#f97316", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>↕</button>
            </div>

            {/* To */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#8a8498" }}>To</label>
                <span style={{ fontSize: 11, color: "#5c5672" }}>
                  Balance: {toBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {to}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, background: "rgba(7,6,11,0.6)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 14px", alignItems: "center" }}>
                <select value={to} onChange={(e) => setTo(e.target.value)}
                  style={{ background: "transparent", border: "none", color: toToken.color, fontSize: 15, fontWeight: 700, outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
                  {TOKENS.filter((t) => t.symbol !== from).map((t) => (
                    <option key={t.symbol} value={t.symbol} style={{ background: "#14102c" }}>{t.icon} {t.symbol}</option>
                  ))}
                </select>
                <div style={{ flex: 1, textAlign: "right", fontSize: 18, fontWeight: 700, color: quote ? "#e8e4ef" : "#5c5672" }}>
                  {quoteLoading ? "..." : quote ? quote.amountOut : "0.00"}
                </div>
              </div>
            </div>

            {/* Quote details */}
            {parsedAmt > 0 && quote && (
              <div style={{ padding: "12px 14px", background: "rgba(7,6,11,0.5)", borderRadius: 10, marginBottom: 14, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498", marginBottom: 4 }}>
                  <span>Route</span><span style={{ color: "#e8e4ef" }}>{quote.provider}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498", marginBottom: 4 }}>
                  <span>Price impact</span><span style={{ color: quote.priceImpact > 1 ? "#f59e0b" : "#22c55e" }}>{quote.priceImpact}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8a8498" }}>
                  <span>Gas fee</span><span style={{ color: "#22c55e", fontWeight: 600 }}>Gasless (Cartridge)</span>
                </div>
              </div>
            )}

            {parsedAmt > 0 && !quote && !quoteLoading && (
              <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 10, marginBottom: 14, fontSize: 13, color: "#ef4444" }}>
                No route found (tried AVNU + Ekubo).
                {from !== "ETH" && to !== "ETH" && (
                  <span style={{ display: "block", fontSize: 12, color: "#8a8498", marginTop: 4 }}>
                    Tip: On Sepolia testnet, try STRK ↔ ETH — it has the most liquidity.
                  </span>
                )}
              </div>
            )}

            <button onClick={handleSwap} disabled={parsedAmt <= 0 || from === to || !connected || !quote || parsedAmt > fromBalance}
              style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", fontWeight: 600, fontSize: 14, color: "#fff", background: "linear-gradient(135deg,#f97316,#ea580c)", cursor: parsedAmt <= 0 || !connected || !quote || parsedAmt > fromBalance ? "not-allowed" : "pointer", opacity: parsedAmt <= 0 || !connected || !quote || parsedAmt > fromBalance ? 0.4 : 1, boxShadow: "0 2px 16px rgba(249,115,22,0.3)", fontFamily: "inherit" }}>
              Swap {from} → {to}
            </button>
            <p style={{ fontSize: 11, color: "#5c5672", textAlign: "center", marginTop: 10 }}>via wallet.swap() · AVNU / Ekubo</p>
          </>
        )}

        {/* PROCESSING */}
        {step === 1 && (
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #f97316", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 18px", animation: "sp .8s linear infinite" }} />
            <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
            <p style={{ color: "#e8e4ef", fontWeight: 600, fontSize: 15, margin: "0 0 18px" }}>Swapping on Starknet...</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
              {["Getting best route via wallet.getQuote()", "Executing swap via wallet.swap()", "Confirming on Starknet..."].map((s, i) => (
                <div key={i} style={{ fontSize: 13, color: "#8a8498", display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "#22c55e" }}>✓</span> {s}</div>
              ))}
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {step === 2 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(249,115,22,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24 }}>🔄</div>
            <p style={{ color: "#f97316", fontWeight: 700, fontSize: 18, margin: "0 0 4px" }}>Swap Complete!</p>
            <p style={{ color: "#8a8498", fontSize: 14, margin: "0 0 6px" }}>{parsedAmt} {from} → {quote?.amountOut} {to}</p>
            {txHash && <a href={explorerUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontSize: 11, color: "#22c55e", fontFamily: "monospace", margin: "0 0 18px", wordBreak: "break-all", textDecoration: "none" }}>tx: {txHash} · View on Voyager ↗</a>}
            <button onClick={handleClose} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)", color: "#8a8498", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
          </div>
        )}

        {/* ERROR */}
        {step === 3 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24 }}>✕</div>
            <p style={{ color: "#ef4444", fontWeight: 700, fontSize: 16, margin: "0 0 4px" }}>Swap Failed</p>
            <p style={{ color: "#8a8498", fontSize: 13, margin: "0 0 18px" }}>{error}</p>
            <button onClick={() => setStep(0)} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)", color: "#8a8498", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}