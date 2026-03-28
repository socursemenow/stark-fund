// ─────────────────────────────────────────────────────────
// src/components/ShareCampaign.jsx
// Generates share links for Twitter, Telegram, and copy
// ─────────────────────────────────────────────────────────
import { useState } from "react";
import toast from "react-hot-toast";

export default function ShareCampaign({ campaign }) {
  const [copied, setCopied] = useState(false);
  const c = campaign;
  const pct = Math.round((c.raised / c.goal) * 100);

  const url = typeof window !== "undefined"
    ? `${window.location.origin}/campaign/${c.id}`
    : "";

  const tweetText = `🚀 "${c.title}" is raising ${c.goal.toLocaleString()} STRK on StarkFund!\n\n${c.tagline}\n\n${pct}% funded · ${c.backers.length} backers · Gasless on @Starknet\n\nBack it now 👇\n${url}\n\nBuilt with @starkzap ⚡`;

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`🚀 "${c.title}" — ${c.tagline}. Back it on StarkFund!`)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="flex gap-2 flex-wrap">
      {/* Twitter */}
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)",
          color: "#f97316", textDecoration: "none", transition: "all 0.15s",
        }}
      >
        𝕏 Share on X
      </a>

      {/* Telegram */}
      <a
        href={telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: "rgba(41,169,235,0.1)", border: "1px solid rgba(41,169,235,0.2)",
          color: "#29a9eb", textDecoration: "none", transition: "all 0.15s",
        }}
      >
        ✈️ Telegram
      </a>

      {/* Copy link */}
      <button
        onClick={handleCopy}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
          color: copied ? "#22c55e" : "#8a8498", cursor: "pointer", fontFamily: "inherit",
          transition: "all 0.15s",
        }}
      >
        {copied ? "✓ Copied!" : "🔗 Copy Link"}
      </button>
    </div>
  );
}