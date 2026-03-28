import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCampaignStore } from "../hooks/useCampaigns";
import { useWalletStore } from "../hooks/useWallet";
import { getExplorerUrl } from "../hooks/useStarkzap";
import { api } from "../lib/api";
import FundModal from "../components/FundModal";
import StakeModal from "../components/StakeModal";
import ShareCampaign from "../components/ShareCampaign";
import FounderPanel from "../components/FounderPanel";
import VoteRefund from "../components/VoteRefund";

const STRK_PRICE = 0.42;
const CAT_COLORS = {
  Education: "#a78bfa", Agriculture: "#22c55e", Healthcare: "#f472b6",
  Fintech: "#f97316", Social: "#60a5fa", Other: "#8a8498",
};

const backerAddr = (b) => b.backer_address || b.address || "";
const backerDate = (b) => b.created_at || b.date || "";
const backerTxHash = (b) => b.tx_hash || b.txHash || b.transaction_hash || "";

function daysLeft(d) {
  return Math.max(0, Math.ceil((new Date(d) - new Date()) / 86400000));
}

function Badge({ children, color = "#f97316" }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md whitespace-nowrap"
      style={{ color, background: color + "15", border: `1px solid ${color}28` }}
    >
      {children}
    </span>
  );
}

function Bar({ pct, h = 8 }) {
  const full = pct >= 100;
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: h, background: "rgba(249,115,22,0.08)" }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${Math.min(pct, 100)}%`,
          background: full ? "linear-gradient(90deg,#22c55e,#4ade80)" : "linear-gradient(90deg,#f97316,#fb923c)",
          boxShadow: full ? undefined : "0 0 10px rgba(249,115,22,0.25)",
        }}
      />
    </div>
  );
}

export default function Campaign({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const authenticated = !!user;
  const campaigns = useCampaignStore((s) => s.campaigns);
  const fetchCampaigns = useCampaignStore((s) => s.fetchCampaigns);
  const address = useWalletStore((s) => s.address);
  const [fundOpen, setFundOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch campaign — from store first, then API as fallback
  const loadCampaign = useCallback(async () => {
    setLoading(true);

    // Check store first
    const fromStore = campaigns.find((c) => c.id === id);
    if (fromStore) {
      setCampaign(fromStore);
      setLoading(false);
    }

    // Also fetch from API for latest data
    try {
      const fromApi = await api.getCampaign(id);
      if (fromApi) {
        setCampaign(fromApi);
      }
    } catch (err) {
      console.warn("[Campaign] API fetch failed:", err.message);
    }
    setLoading(false);
  }, [id, campaigns]);

  useEffect(() => {
    loadCampaign();
  }, [id]);

  // Refresh after funding
  const handleFunded = () => {
    setFundOpen(false);
    loadCampaign();
    fetchCampaigns();
  };

  const c = campaign;

  if (loading && !c) {
    return (
      <div className="max-w-[700px] mx-auto px-5 pt-10 text-center">
        <div style={{ width: 32, height: 32, border: "3px solid #f97316", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 12px", animation: "sp .8s linear infinite" }} />
        <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: "#8a8498", fontSize: 14 }}>Loading campaign...</p>
      </div>
    );
  }

  if (!c) {
    return (
      <div className="max-w-[700px] mx-auto px-5 pt-10 text-center">
        <p className="text-[#5c5672] text-lg">Campaign not found</p>
        <button onClick={() => navigate("/explore")} className="mt-4 text-orange-500 font-semibold text-sm">
          ← Back to campaigns
        </button>
      </div>
    );
  }

  const pct = c.goal > 0 ? ((c.raised || 0) / c.goal) * 100 : 0;
  const dl = daysLeft(c.deadline);
  const col = CAT_COLORS[c.category] || CAT_COLORS.Other;
  const expired = new Date(c.deadline) < new Date();
  const funded = pct >= 100;

  return (
    <div className="max-w-[700px] mx-auto px-5 pb-16 pt-4">
      {/* Back */}
      <button
        onClick={() => navigate("/explore")}
        className="text-orange-400 text-sm font-semibold mb-5 flex items-center gap-1 hover:text-orange-300 transition-colors"
      >
        <span className="text-base">←</span> Back
      </button>

      {/* Badges */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Badge color={col}>{c.category}</Badge>
        {funded && <Badge color="#22c55e">Funded</Badge>}
        {expired && !funded && <Badge color="#ef4444">Expired</Badge>}
        {c.staked && <Badge color="#f59e0b">Staking Active</Badge>}
        {c.refunded && <Badge color="#8a8498">Refunded</Badge>}
      </div>

      {/* Title */}
      <h2
        className="text-2xl sm:text-3xl font-extrabold text-orange-500 tracking-tight mb-1"
        style={{ textShadow: "0 0 30px rgba(249,115,22,0.2)" }}
      >
        {c.title}
      </h2>
      <p className="text-[#8a8498] text-sm mb-6">{c.tagline}</p>

      {/* Founder panel */}
      {authenticated && (
        <FounderPanel campaign={c} onStake={() => setStakeOpen(true)} />
      )}

      {/* Main card */}
      <div className="bg-[rgba(20,16,28,0.7)] backdrop-blur border border-white/[0.06] rounded-2xl p-6 mb-6">
        <div className="flex justify-between items-end mb-4 flex-wrap gap-3">
          <div>
            <div
              className="text-3xl font-extrabold text-orange-500"
              style={{ textShadow: "0 0 20px rgba(249,115,22,0.2)" }}
            >
              {(c.raised || 0).toLocaleString()}{" "}
              <span className="text-sm font-normal text-[#8a8498]">STRK</span>
            </div>
            <div className="text-xs text-[#5c5672]">of {(c.goal || 0).toLocaleString()} STRK goal</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-[#f5f3fa]">{dl}</div>
            <div className="text-[11px] text-[#5c5672]">days left</div>
          </div>
        </div>

        <Bar pct={pct} />
        <div className="text-xs text-[#5c5672] mt-1.5">{Math.round(pct)}% funded</div>

        <div className="flex gap-6 mt-5 flex-wrap">
          <div>
            <div className="text-[11px] text-[#5c5672]">Backers</div>
            <div className="text-xl font-bold text-[#f5f3fa]">{c.backers?.length || c.backerCount || 0}</div>
          </div>
          <div>
            <div className="text-[11px] text-[#5c5672]">USD Value</div>
            <div className="text-xl font-bold text-[#f5f3fa]">${((c.raised || 0) * STRK_PRICE).toLocaleString()}</div>
          </div>
          {c.staked && (
            <div>
              <div className="text-[11px] text-green-500">Yield Earned</div>
              <div className="text-xl font-bold text-green-500">+{c.yield_earned || 0} STRK</div>
            </div>
          )}
        </div>

        {/* Fund button */}
        {authenticated && !funded && !expired && (
          <button
            onClick={() => setFundOpen(true)}
            className="w-full mt-5 py-3 rounded-xl font-semibold text-white bg-gradient-to-br from-orange-500 to-orange-600 shadow-[0_2px_16px_rgba(249,115,22,0.3)] hover:shadow-[0_4px_24px_rgba(249,115,22,0.4)] transition-all"
          >
            Fund This Project
          </button>
        )}

        {authenticated && funded && !c.staked && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-500 text-center">
            This project has been fully funded
          </div>
        )}

        {expired && !funded && !c.refunded && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 text-center">
            ⏰ Deadline passed — refund pending from founder
          </div>
        )}

        {c.refunded && (
          <div className="mt-4 p-3 rounded-xl text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: 14, color: "#8a8498", margin: "0 0 6px" }}>💸 All backers have been refunded</p>
            {(c.refund_tx_hash || c.refund_tx) && (
              <a
                href={getExplorerUrl(c.refund_tx_hash || c.refund_tx)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#22c55e", textDecoration: "none", fontFamily: "monospace" }}
              >
                tx: {(c.refund_tx_hash || c.refund_tx || "").slice(0, 18)}... · View on Voyager ↗
              </a>
            )}
          </div>
        )}

        {/* Launch fee tx */}
        {c.launch_fee_tx && (
          <div className="mt-3 text-center">
            <a
              href={getExplorerUrl(c.launch_fee_tx)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: "#5c5672", textDecoration: "none", fontFamily: "monospace" }}
            >
              Launch fee tx: {c.launch_fee_tx.slice(0, 14)}... · Voyager ↗
            </a>
          </div>
        )}
      </div>

      {/* Vote refund */}
      {authenticated && <VoteRefund campaign={c} />}

      {/* Share */}
      <div className="mb-6 mt-6">
        <h3 className="text-[15px] font-bold text-[#f5f3fa] mb-3">Share This Campaign</h3>
        <ShareCampaign campaign={c} />
      </div>

      {/* About */}
      <div className="mb-6">
        <h3 className="text-[15px] font-bold text-[#f5f3fa] mb-2">About</h3>
        <p className="text-sm text-[#8a8498] leading-relaxed">{c.description}</p>
      </div>

      {/* Socials */}
      {(c.twitter || c.discord || c.telegram) && (
        <div className="mb-6">
          <h3 className="text-[15px] font-bold text-[#f5f3fa] mb-3">Contact Founder</h3>
          <div className="flex gap-2 flex-wrap">
            {c.twitter && (
              <a href={c.twitter.startsWith("http") ? c.twitter : `https://x.com/${c.twitter.replace("@", "")}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:border-orange-500/30"
                style={{ background: "rgba(20,16,28,0.7)", border: "1px solid rgba(255,255,255,0.06)", color: "#e8e4ef" }}>
                <span>𝕏</span> {c.twitter}
              </a>
            )}
            {c.discord && (
              <a href={c.discord.startsWith("http") ? c.discord : `https://discord.com`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:border-orange-500/30"
                style={{ background: "rgba(20,16,28,0.7)", border: "1px solid rgba(255,255,255,0.06)", color: "#7289da" }}>
                <span>💬</span> {c.discord}
              </a>
            )}
            {c.telegram && (
              <a href={c.telegram.startsWith("http") ? c.telegram : `https://t.me/${c.telegram.replace("@", "")}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:border-orange-500/30"
                style={{ background: "rgba(20,16,28,0.7)", border: "1px solid rgba(255,255,255,0.06)", color: "#29a9eb" }}>
                <span>✈️</span> {c.telegram}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Backers list */}
      <div>
        <h3 className="text-[15px] font-bold text-[#f5f3fa] mb-3">Backers ({c.backers?.length || 0})</h3>
        {(!c.backers || c.backers.length === 0) ? (
          <p className="text-sm text-[#5c5672]">No backers yet. Be the first!</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {c.backers.map((b, i) => {
              const txHash = backerTxHash(b);
              return (
                <div
                  key={b.id || i}
                  className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.06] text-sm"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[#8a8498] font-mono text-xs">
                        {backerAddr(b).slice(0, 10)}...{backerAddr(b).slice(-6)}
                      </span>
                      {b.refunded && (
                        <span className="ml-2 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">refunded</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[#e8e4ef] font-semibold">{b.amount} STRK</span>
                      {b.token_paid && b.token_paid !== "STRK" && (
                        <span className="text-[10px] text-[#5c5672] ml-1">({b.token_paid})</span>
                      )}
                      <div className="text-[11px] text-[#5c5672]">
                        {backerDate(b) ? new Date(backerDate(b)).toLocaleDateString() : ""}
                      </div>
                    </div>
                  </div>
                  {/* Transaction link — always visible when tx hash exists */}
                  {txHash && (
                    <a
                      href={getExplorerUrl(txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg text-[11px] font-mono w-fit transition-all hover:border-orange-500/30"
                      style={{
                        background: "rgba(249,115,22,0.06)",
                        border: "1px solid rgba(249,115,22,0.12)",
                        color: "#f97316",
                        textDecoration: "none",
                      }}
                    >
                      <span style={{ fontSize: 13 }}>🔗</span>
                      tx: {txHash.slice(0, 12)}...{txHash.slice(-6)} · Voyager ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fund modal — handleFunded refreshes campaign data after funding */}
      <FundModal open={fundOpen} onClose={handleFunded} campaign={c} />

      {/* Stake modal */}
      <StakeModal open={stakeOpen} onClose={() => setStakeOpen(false)} campaign={c} />
    </div>
  );
}