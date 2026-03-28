// ─────────────────────────────────────────────────────────
// src/components/CreateModal.jsx
// Creates a campaign — now ACTUALLY pays 10 STRK launch fee
// via payLaunchFee() before creating
// ─────────────────────────────────────────────────────────
import { useState } from "react";
import toast from "react-hot-toast";
import { useCampaignStore } from "../hooks/useCampaigns";
import { useWallet, useWalletStore } from "../hooks/useWallet";

const CATEGORIES = ["Education", "Agriculture", "Healthcare", "Fintech", "Social", "Other"];
const CAT_COLORS = {
  Education: "#a78bfa", Agriculture: "#22c55e", Healthcare: "#f472b6",
  Fintech: "#f97316", Social: "#60a5fa", Other: "#8a8498",
};

const LAUNCH_FEE = "10"; // 10 STRK to create a campaign
const MIN_DEADLINE_DAYS = 3; // minimum 3 days from now

// Get minimum date (3 days from today) in YYYY-MM-DD format
function getMinDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + MIN_DEADLINE_DAYS);
  return d.toISOString().split("T")[0];
}

export default function CreateModal({ open, onClose }) {
  const [form, setForm] = useState({
    title: "", tagline: "", description: "", goal: "", deadline: "", category: "Fintech",
    customCategory: "", twitter: "", discord: "", telegram: "",
  });
  const [step, setStep] = useState(0); // 0=form, 1=paying fee, 2=creating, 3=done
  const [error, setError] = useState(null);
  const { addCampaign } = useCampaignStore();
  const { payLaunchFee, connected } = useWallet();
  const walletAddress = useWalletStore((s) => s.address);
  const address = walletAddress || "0x0000";

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const categoryValid = form.category !== "Other" || form.customCategory.trim().length > 0;
  const valid = form.title && form.tagline && form.goal && form.deadline && form.twitter && form.discord && form.telegram && form.deadline >= getMinDeadline() && categoryValid;

  const handleCreate = async () => {
    if (!valid) return;
    setStep(1);
    setError(null);

    try {
      // ── Step 1: Pay 10 STRK launch fee on-chain ──
      const feeResult = await payLaunchFee(10);
      if (!feeResult) {
        // User rejected or tx failed — go back to form
        setStep(0);
        return;
      }

      setStep(2);

      // ── Step 2: Create campaign in backend/store ──
      const campaign = await addCampaign({
        title: form.title,
        tagline: form.tagline,
        description: form.description,
        category: form.category === "Other" && form.customCategory.trim()
          ? form.customCategory.trim()
          : form.category,
        goal: parseFloat(form.goal),
        deadline: form.deadline,
        wallet_address: address, // founder's wallet
        founder_address: address,
        founder_name: address?.slice(0, 6) + "..." + address?.slice(-4),
        twitter: form.twitter,
        discord: form.discord,
        telegram: form.telegram,
        launch_fee_tx: feeResult.txHash, // record the on-chain tx hash
      });

      setStep(3);
      toast.success(`"${form.title}" is live!`);

      // Auto-close after a moment
      setTimeout(() => {
        setStep(0);
        setForm({ title: "", tagline: "", description: "", goal: "", deadline: "", category: "Fintech", customCategory: "", twitter: "", discord: "", telegram: "" });
        onClose();
      }, 1800);
    } catch (err) {
      console.error("Create campaign failed:", err);
      setError(err.message || "Failed to create campaign");
      toast.error("Failed to create campaign");
      setStep(0);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={onClose}>
      <div className="absolute inset-0 bg-[#04030888] backdrop-blur-md" />
      <div
        className="relative bg-[#14102c]/95 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-7 w-full max-w-[460px] max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[17px] font-bold text-[#f5f3fa]">
            {step === 0 ? "Launch Campaign" : step === 1 ? "Paying Launch Fee..." : step === 2 ? "Creating Campaign..." : "Campaign Live!"}
          </h3>
          <button onClick={onClose} className="text-[#5c5672] text-lg hover:text-white">✕</button>
        </div>

        {/* ── Form ── */}
        {step === 0 && (
          <>
            <Field label="Project Name" value={form.title} onChange={(v) => upd("title", v)} placeholder="e.g. DecentraLearn" />
            <Field label="One-liner" value={form.tagline} onChange={(v) => upd("tagline", v)} placeholder="What does it do?" />
            <Field label="Description" value={form.description} onChange={(v) => upd("description", v)} placeholder="Tell backers about your project..." textarea />

            <div className="flex gap-3">
              <div className="flex-1">
                <Field label="Goal (STRK)" value={form.goal} onChange={(v) => upd("goal", v)} placeholder="2000" type="number" />
              </div>
              <div className="flex-1">
                <Field label="Deadline" value={form.deadline} onChange={(v) => upd("deadline", v)} type="date" min={getMinDeadline()} />
                {form.deadline && form.deadline < getMinDeadline() && (
                  <p style={{ fontSize: 11, color: "#ef4444", marginTop: -10, marginBottom: 8 }}>
                    Minimum {MIN_DEADLINE_DAYS} days from today
                  </p>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#8a8498] mb-1.5">Category</label>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => upd("category", c)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      border: form.category === c
                        ? `1px solid ${CAT_COLORS[c]}`
                        : "1px solid rgba(255,255,255,0.06)",
                      background: form.category === c ? CAT_COLORS[c] + "18" : "transparent",
                      color: form.category === c ? CAT_COLORS[c] : "#5c5672",
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {form.category === "Other" && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={form.customCategory}
                    onChange={(e) => upd("customCategory", e.target.value)}
                    placeholder="Enter your category..."
                    className="w-full bg-[#07060b]/60 border border-white/[0.06] rounded-xl py-2.5 px-3.5 text-[#e8e4ef] text-sm outline-none focus:border-orange-500/30 transition-colors font-[inherit]"
                  />
                </div>
              )}
            </div>

            {/* Socials */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#8a8498] mb-1.5">
                Socials <span className="text-orange-500/60">(required)</span>
              </label>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5c5672] text-sm">𝕏</span>
                  <input
                    type="text"
                    value={form.twitter}
                    onChange={(e) => upd("twitter", e.target.value)}
                    placeholder="@username"
                    className="w-full bg-[#07060b]/60 border border-white/[0.06] rounded-xl py-2.5 pl-9 pr-3.5 text-[#e8e4ef] text-sm outline-none focus:border-orange-500/30 transition-colors font-[inherit]"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5c5672] text-sm">💬</span>
                  <input
                    type="text"
                    value={form.discord}
                    onChange={(e) => upd("discord", e.target.value)}
                    placeholder="Discord username or invite link"
                    className="w-full bg-[#07060b]/60 border border-white/[0.06] rounded-xl py-2.5 pl-9 pr-3.5 text-[#e8e4ef] text-sm outline-none focus:border-orange-500/30 transition-colors font-[inherit]"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5c5672] text-sm">✈️</span>
                  <input
                    type="text"
                    value={form.telegram}
                    onChange={(e) => upd("telegram", e.target.value)}
                    placeholder="@username or t.me/ link"
                    className="w-full bg-[#07060b]/60 border border-white/[0.06] rounded-xl py-2.5 pl-9 pr-3.5 text-[#e8e4ef] text-sm outline-none focus:border-orange-500/30 transition-colors font-[inherit]"
                  />
                </div>
              </div>
            </div>

            {/* Launch fee notice */}
            <div style={{
              padding: "12px 14px", borderRadius: 12, marginBottom: 14,
              background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.12)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "#8a8498" }}>Launch fee</span>
                <span style={{ color: "#f97316", fontWeight: 700 }}>{LAUNCH_FEE} STRK</span>
              </div>
              <p style={{ fontSize: 11, color: "#5c5672", margin: 0, lineHeight: 1.4 }}>
                One-time fee to prevent spam. Paid to the platform via wallet.transfer(). Gas is free (Cartridge paymaster).
              </p>
            </div>

            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 14, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", fontSize: 13, color: "#ef4444" }}>
                {error}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={!valid || !connected}
              className="w-full py-3 rounded-xl font-semibold text-white btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Pay {LAUNCH_FEE} STRK & Launch
            </button>
            <p className="text-[11px] text-[#5c5672] text-center mt-2">
              Gasless transaction via Cartridge Controller
            </p>
          </>
        )}

        {/* ── Paying Fee ── */}
        {step === 1 && (
          <div className="text-center py-7">
            <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full mx-auto mb-5 animate-spin" />
            <p className="text-[#e8e4ef] font-semibold text-[15px] mb-2">Paying Launch Fee...</p>
            <p className="text-[#f97316] text-sm mb-5">{LAUNCH_FEE} STRK → Platform Wallet</p>
            <div className="flex flex-col gap-2 text-left">
              {["Transferring launch fee via wallet.transfer()", "Confirming on Starknet..."].map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px] text-[#8a8498]">
                  <span className="text-green-500">✓</span> {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Creating Campaign ── */}
        {step === 2 && (
          <div className="text-center py-7">
            <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full mx-auto mb-5 animate-spin" />
            <p className="text-[#e8e4ef] font-semibold text-[15px] mb-5">Creating Campaign...</p>
            <div className="flex flex-col gap-2 text-left">
              {["✅ Launch fee paid", "Setting up campaign wallet", "Registering campaign on platform"].map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px] text-[#8a8498]">
                  <span className="text-green-500">✓</span> {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === 3 && (
          <div className="text-center py-7">
            <div className="w-14 h-14 rounded-full bg-orange-500/12 flex items-center justify-center mx-auto mb-3.5 text-2xl">⚡</div>
            <p className="text-orange-500 font-bold text-lg glow-orange">Campaign is live!</p>
            <p className="text-[#8a8498] text-sm mt-1">Redirecting...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reusable field component ──
function Field({ label, value, onChange, placeholder, type = "text", textarea, min }) {
  const cls = "w-full bg-[#07060b]/60 border border-white/[0.06] rounded-xl py-2.5 px-3.5 text-[#e8e4ef] text-sm outline-none focus:border-orange-500/30 transition-colors font-[inherit]";
  return (
    <div className="mb-3.5">
      <label className="block text-xs font-semibold text-[#8a8498] mb-1.5 tracking-wide">{label}</label>
      {textarea ? (
        <textarea rows={3} className={cls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ resize: "vertical" }} />
      ) : (
        <input type={type} className={cls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} min={min} />
      )}
    </div>
  );
}