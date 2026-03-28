const CAT_COLORS = {
  Education: "#a78bfa", Agriculture: "#22c55e", Healthcare: "#f472b6",
  Fintech: "#f97316", Social: "#60a5fa", Other: "#8a8498",
};

function daysLeft(d) {
  return Math.max(0, Math.ceil((new Date(d) - new Date()) / 86400000));
}

export default function CampaignCard({ campaign: c, onClick }) {
  const pct = (c.raised / c.goal) * 100;
  const dl = daysLeft(c.deadline);
  const col = CAT_COLORS[c.category] || CAT_COLORS.Other;
  const expired = new Date(c.deadline) < new Date();
  const funded = pct >= 100;
  const initials = (c.founder_name || "??")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      onClick={onClick}
      className="bg-[rgba(20,16,28,0.7)] backdrop-blur border border-white/[0.06] rounded-2xl p-5 cursor-pointer transition-all hover:bg-[rgba(30,24,42,0.8)] hover:border-orange-500/20 hover:shadow-[0_0_10px_rgba(249,115,22,0.06)]"
      style={{ opacity: expired && !funded ? 0.7 : 1 }}
    >
      {/* Top row: badges */}
      <div className="flex justify-between items-center mb-3.5">
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md"
          style={{ color: col, background: col + "15", border: `1px solid ${col}28` }}
        >
          {c.category}
        </span>
        <div className="flex gap-1.5">
          {funded && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md text-green-500 bg-green-500/10 border border-green-500/20">
              Funded
            </span>
          )}
          {expired && !funded && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md text-red-400 bg-red-500/10 border border-red-500/20">
              Expired
            </span>
          )}
          {c.refunded && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md text-[#8a8498] bg-white/[0.06] border border-white/[0.08]">
              Refunded
            </span>
          )}
        </div>
      </div>

      {/* Title + tagline */}
      <h3 className="text-[17px] font-bold text-[#f5f3fa] mb-1">{c.title}</h3>
      <p className="text-[13px] text-[#8a8498] leading-snug mb-4">{c.tagline}</p>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(249,115,22,0.08)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: pct >= 100 ? "linear-gradient(90deg,#22c55e,#4ade80)" : "linear-gradient(90deg,#f97316,#fb923c)",
          }}
        />
      </div>

      {/* Amount + days */}
      <div className="flex justify-between mt-2.5 text-[13px]">
        <span className="text-[#e8e4ef] font-semibold">
          {c.raised.toLocaleString()}{" "}
          <span className="text-[#5c5672] font-normal">/ {c.goal.toLocaleString()} STRK</span>
        </span>
        <span className="text-[#5c5672]">{expired ? "Expired" : `${dl}d left`}</span>
      </div>

      {/* Footer: founder + backers */}
      <div className="flex items-center gap-2 mt-3.5 pt-3 border-t border-white/[0.06]">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
          style={{ background: `linear-gradient(135deg,${col}dd,${col}88)` }}
        >
          {initials}
        </div>
        <span className="text-xs text-[#8a8498]">{c.founder_name}</span>
        <span className="ml-auto text-[11px] text-[#5c5672]">{c.backers.length} backers</span>
      </div>
    </div>
  );
}