import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

function Bolt({ size = 18, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M13 2L4 14h7l-2 8 11-12h-7l2-8z" fill="#f97316" fillOpacity="0.9" />
    </svg>
  );
}

export default function Landing({ onLogin, loading, authenticated }) {
  const navigate = useNavigate();

  // If already logged in, redirect via effect
  useEffect(() => {
    if (authenticated) navigate("/explore");
  }, [authenticated, navigate]);

  if (authenticated) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-5 py-10 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute -top-48 -right-48 w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.07),transparent_70%)] pointer-events-none" />
      <div className="absolute -bottom-36 -left-36 w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.04),transparent_70%)] pointer-events-none" />

      {/* Floating bolts */}
      <Bolt size={22} style={{ position: "absolute", top: "12%", right: "8%", opacity: 0.5, transform: "rotate(15deg)" }} />
      <Bolt size={16} style={{ position: "absolute", top: "25%", left: "5%", opacity: 0.35, transform: "rotate(-20deg)" }} />
      <Bolt size={14} style={{ position: "absolute", bottom: "20%", right: "15%", opacity: 0.3, transform: "rotate(30deg)" }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Badge */}
        <div className="flex items-center gap-2 text-[11px] font-bold text-orange-500 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 mb-7 tracking-wider uppercase">
          <Bolt size={14} /> Built on Starknet · Powered by Starkzap
        </div>

        {/* Heading */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#f5f3fa] leading-tight tracking-tight">
          Fund the next
          <br />
          <span className="text-orange-500" style={{ textShadow: "0 0 40px rgba(249,115,22,0.4), 0 0 80px rgba(249,115,22,0.15)" }}>
            big idea
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-[#8a8498] text-base max-w-md mx-auto mt-5 mb-8 leading-relaxed">
          Gasless micro-fundraising on Starknet. Back a project in one tap or launch your own campaign. No wallets. No gas. No borders.
        </p>

        {/* CTAs */}
        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={onLogin}
            disabled={loading}
            className="px-7 py-3 rounded-xl font-semibold text-white bg-gradient-to-br from-orange-500 to-orange-600 shadow-[0_2px_16px_rgba(249,115,22,0.3)] hover:shadow-[0_4px_24px_rgba(249,115,22,0.45)] transition-all disabled:opacity-50"
          >
            {loading ? "Connecting..." : "Sign in & Connect"}
          </button>
          <button
            onClick={() => navigate("/explore")}
            className="px-7 py-3 rounded-xl font-semibold text-[#8a8498] bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition-all"
          >
            Explore Campaigns
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-9 mt-14 flex-wrap justify-center">
          {[
            ["$0.00", "Gas Fees"],
            ["< 2s", "Settlement"],
            ["1 Tap", "To Fund"],
            ["9+", "SDK Modules"],
          ].map(([val, label]) => (
            <div key={label} className="text-center">
              <div className="text-xl font-bold text-orange-500" style={{ textShadow: "0 0 10px rgba(249,115,22,0.25)" }}>
                {val}
              </div>
              <div className="text-[11px] text-[#5c5672] mt-1 uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>

        {/* SDK methods strip */}
        <div className="mt-14 px-6 py-3.5 bg-white/[0.03] backdrop-blur border border-white/[0.06] rounded-xl flex gap-5 flex-wrap justify-center">
          {["wallet.transfer()", "wallet.swap()", "wallet.stake()", "wallet.getQuote()", "sdk.onboard()"].map((m) => (
            <span key={m} className="text-xs font-mono text-orange-400/60">
              {m}
            </span>
          ))}
        </div>

        {/* How it works */}
        <div className="mt-20 w-full max-w-2xl">
          <h2 className="text-2xl font-extrabold text-[#f5f3fa] text-center mb-10">
            How it <span className="text-orange-500">works</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                step: "01",
                icon: "🔐",
                title: "Sign in",
                desc: "Google, Twitter, or passkeys. Cartridge Controller creates an invisible Starknet wallet — no extensions needed.",
                sdk: "sdk.onboard()",
              },
              {
                step: "02",
                icon: "💸",
                title: "Fund or Launch",
                desc: "Back a project in one tap with any token. Or launch your own campaign in 30 seconds.",
                sdk: "wallet.transfer()",
              },
              {
                step: "03",
                icon: "📈",
                title: "Earn & Grow",
                desc: "Founders stake raised funds to earn yield. Swap tokens. All gasless on Starknet.",
                sdk: "wallet.stake()",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="p-5 rounded-2xl text-center"
                style={{
                  background: "rgba(20,16,28,0.7)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="text-3xl mb-3">{item.icon}</div>
                <div
                  className="text-[10px] font-bold tracking-widest mb-2"
                  style={{ color: "#f97316" }}
                >
                  STEP {item.step}
                </div>
                <h3 className="text-base font-bold text-[#f5f3fa] mb-2">{item.title}</h3>
                <p className="text-xs text-[#8a8498] leading-relaxed mb-3">{item.desc}</p>
                <code
                  className="text-[11px] font-mono px-2 py-1 rounded-md"
                  style={{
                    background: "rgba(249,115,22,0.08)",
                    color: "#fb923c",
                    border: "1px solid rgba(249,115,22,0.15)",
                  }}
                >
                  {item.sdk}
                </code>
              </div>
            ))}
          </div>

          {/* Deadline safety */}
          <div
            className="mt-8 p-4 rounded-xl text-center"
            style={{
              background: "rgba(34,197,94,0.06)",
              border: "1px solid rgba(34,197,94,0.12)",
            }}
          >
            <p className="text-sm text-[#8a8498] leading-relaxed">
              <span className="text-green-500 font-semibold">Built-in safety:</span> If a campaign
              doesn't reach its goal by the deadline, all backers are automatically refunded via a
              single batch transaction. No manual action needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}