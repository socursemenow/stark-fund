import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCampaignStore } from "../hooks/useCampaigns";
import { useWalletStore } from "../hooks/useWallet";
import { getExplorerUrl } from "../hooks/useStarkzap";

const STRK_PRICE = 0.42;

// Helper: get address from backer (server=backer_address, local=address)
const backerAddr = (b) => b.backer_address || b.address || "";
// Helper: get date from backer (server=created_at, local=date)
const backerDate = (b) => b.created_at || b.date || "";

function daysLeft(d) {
  return Math.max(0, Math.ceil((new Date(d) - new Date()) / 86400000));
}

function StatCard({ label, value, sub, color = "#f97316", icon }) {
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 14,
      background: "rgba(20,16,28,0.7)", border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "#5c5672", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</span>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#5c5672", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CampaignRow({ c, onClick }) {
  const pct = Math.round((c.raised / c.goal) * 100);
  const expired = new Date(c.deadline) < new Date();
  const funded = pct >= 100;

  const statusConfig = funded
    ? { label: "FUNDED", color: "#22c55e", bg: "rgba(34,197,94,0.12)" }
    : expired
    ? c.refunded
      ? { label: "REFUNDED", color: "#8a8498", bg: "rgba(255,255,255,0.06)" }
      : { label: "EXPIRED", color: "#ef4444", bg: "rgba(239,68,68,0.12)" }
    : { label: "ACTIVE", color: "#f97316", bg: "rgba(249,115,22,0.12)" };

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 18px", borderRadius: 14, cursor: "pointer", transition: "all 0.15s",
        background: "rgba(20,16,28,0.7)", border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f5f3fa" }}>{c.title}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, color: statusConfig.color, background: statusConfig.bg,
            padding: "2px 8px", borderRadius: 5, letterSpacing: 0.5,
          }}>
            {statusConfig.label}
          </span>
          {c.staked && (
            <span style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.12)", padding: "2px 8px", borderRadius: 5 }}>
              STAKING
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#5c5672", marginBottom: 6 }}>{c.tagline}</div>
        {/* Mini progress bar */}
        <div style={{ width: "100%", maxWidth: 220, height: 4, borderRadius: 4, background: "rgba(249,115,22,0.08)" }}>
          <div style={{
            width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 4,
            background: funded ? "linear-gradient(90deg,#22c55e,#4ade80)" : expired ? "#ef4444" : "linear-gradient(90deg,#f97316,#fb923c)",
          }} />
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: statusConfig.color }}>{pct}%</div>
        <div style={{ fontSize: 11, color: "#5c5672" }}>{c.raised.toLocaleString()} / {c.goal.toLocaleString()}</div>
        {!expired && !funded && <div style={{ fontSize: 10, color: "#5c5672", marginTop: 2 }}>{daysLeft(c.deadline)}d left</div>}
      </div>
    </div>
  );
}

export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const campaigns = useCampaignStore((s) => s.campaigns);
  const address = useWalletStore((s) => s.address);
  const [tab, setTab] = useState("overview");

  if (!user) {
    return (
      <div className="max-w-[700px] mx-auto px-5 pt-16 text-center">
        <p style={{ fontSize: 40, marginBottom: 12 }}>🔒</p>
        <p style={{ color: "#8a8498", fontSize: 16 }}>Sign in to view your dashboard</p>
      </div>
    );
  }

  // Categorize campaigns
  const active = campaigns.filter((c) => {
    const expired = new Date(c.deadline) < new Date();
    const funded = c.raised >= c.goal;
    return !expired && !funded;
  });

  const funded = campaigns.filter((c) => c.raised >= c.goal);

  const expired = campaigns.filter((c) => {
    const isExpired = new Date(c.deadline) < new Date();
    const isFunded = c.raised >= c.goal;
    return isExpired && !isFunded;
  });

  // Stats
  const totalRaised = campaigns.reduce((sum, c) => sum + c.raised, 0);
  const totalBackers = campaigns.reduce((sum, c) => sum + (c.backers?.length || 0), 0);
  const totalYield = campaigns.reduce((sum, c) => sum + (c.yield_earned || 0), 0);
  const successRate = campaigns.length > 0 ? Math.round((funded.length / campaigns.length) * 100) : 0;

  // All contributions + refund events flattened
  // FIXED: reads backer_address OR address, created_at OR date
  const allActivity = [
    // Contributions
    ...campaigns.flatMap((c) =>
      (c.backers || []).map((b) => ({
        ...b,
        address: backerAddr(b),
        date: backerDate(b),
        type: "fund",
        campaignTitle: c.title,
        campaignId: c.id,
      }))
    ),
    // Refund events
    ...campaigns
      .filter((c) => c.refunded && (c.refund_tx_hash || c.refund_tx))
      .map((c) => ({
        type: "refund",
        campaignTitle: c.title,
        campaignId: c.id,
        amount: c.raised,
        backerCount: c.backers?.length || 0,
        tx_hash: c.refund_tx_hash || c.refund_tx,
        explorer_url: c.refund_explorer_url,
        date: c.refunded_at || "",
      })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "active", label: `Active (${active.length})` },
    { id: "funded", label: `Completed (${funded.length})` },
    { id: "expired", label: `Expired (${expired.length})` },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div className="max-w-[840px] mx-auto px-5 pb-16 pt-4">
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f5f3fa", marginBottom: 20 }}>Dashboard</h2>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 24 }}>
        <StatCard label="Total Raised" value={`${totalRaised.toLocaleString()} STRK`} sub={`≈ $${(totalRaised * STRK_PRICE).toLocaleString()}`} icon="💰" />
        <StatCard label="Backers" value={totalBackers} color="#e8e4ef" icon="👥" />
        <StatCard label="Yield Earned" value={`+${totalYield.toFixed(1)} STRK`} color="#22c55e" icon="📈" />
        <StatCard label="Success Rate" value={`${successRate}%`} color={successRate >= 50 ? "#22c55e" : "#f59e0b"} sub={`${funded.length} of ${campaigns.length} funded`} icon="🎯" />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 3, marginBottom: 18, overflowX: "auto", paddingBottom: 4 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 16px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap",
              background: tab === t.id ? "rgba(249,115,22,0.12)" : "transparent",
              color: tab === t.id ? "#f97316" : "#5c5672",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {active.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316" }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#f5f3fa" }}>Active Campaigns</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {active.map((c) => <CampaignRow key={c.id} c={c} onClick={() => navigate(`/campaign/${c.id}`)} />)}
              </div>
            </div>
          )}

          {funded.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#f5f3fa" }}>Completed Campaigns</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {funded.map((c) => <CampaignRow key={c.id} c={c} onClick={() => navigate(`/campaign/${c.id}`)} />)}
              </div>
            </div>
          )}

          {expired.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#f5f3fa" }}>Expired / Refunded</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {expired.map((c) => (
                  <div key={c.id}>
                    <CampaignRow c={c} onClick={() => navigate(`/campaign/${c.id}`)} />
                    {(c.refund_tx_hash || c.refund_tx) && (
                      <a
                        href={c.refund_explorer_url || getExplorerUrl(c.refund_tx_hash || c.refund_tx)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: "block", marginTop: 4, marginLeft: 18, padding: "6px 12px",
                          borderRadius: 8, fontSize: 11, fontFamily: "monospace",
                          background: "rgba(34,197,94,0.06)", color: "#22c55e",
                          textDecoration: "none", width: "fit-content",
                        }}
                      >
                        Refund tx: {(c.refund_tx_hash || c.refund_tx || "").slice(0, 16)}... · Voyager ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {campaigns.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#5c5672" }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>⚡</p>
              <p style={{ fontSize: 14 }}>No campaigns yet. Launch one to get started!</p>
            </div>
          )}
        </div>
      )}

      {/* ── Active Tab ── */}
      {tab === "active" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {active.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#5c5672" }}>
              <p>No active campaigns right now.</p>
            </div>
          ) : (
            active.map((c) => <CampaignRow key={c.id} c={c} onClick={() => navigate(`/campaign/${c.id}`)} />)
          )}
        </div>
      )}

      {/* ── Completed Tab ── */}
      {tab === "funded" && (
        <div>
          {funded.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#5c5672" }}>
              <p>No completed campaigns yet.</p>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e" }}>{funded.length}</div>
                  <div style={{ fontSize: 11, color: "#5c5672" }}>Projects Funded</div>
                </div>
                <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e" }}>
                    {funded.reduce((s, c) => s + c.raised, 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: "#5c5672" }}>STRK Raised</div>
                </div>
                <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e" }}>
                    {funded.reduce((s, c) => s + (c.backers?.length || 0), 0)}
                  </div>
                  <div style={{ fontSize: 11, color: "#5c5672" }}>Total Backers</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {funded.map((c) => <CampaignRow key={c.id} c={c} onClick={() => navigate(`/campaign/${c.id}`)} />)}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Expired Tab ── */}
      {tab === "expired" && (
        <div>
          {expired.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#5c5672" }}>
              <p>No expired campaigns. All projects are on track!</p>
            </div>
          ) : (
            <>
              <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 12, marginBottom: 16, fontSize: 13, color: "#ef4444" }}>
                These campaigns didn't reach their goal before the deadline. All backers have been (or will be) automatically refunded.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {expired.map((c) => <CampaignRow key={c.id} c={c} onClick={() => navigate(`/campaign/${c.id}`)} />)}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Activity Feed ── */}
      {tab === "activity" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {allActivity.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#5c5672" }}>
              <p>No activity yet. Contributions will appear here.</p>
            </div>
          ) : (
            allActivity.slice(0, 30).map((b, i) => (
              <div
                key={i}
                onClick={() => navigate(`/campaign/${b.campaignId}`)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 16px", borderRadius: 12, cursor: "pointer",
                  background: "rgba(20,16,28,0.5)", border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: "#e8e4ef", fontWeight: 600 }}>
                    {b.type === "refund" ? (
                      <>
                        <span style={{ color: "#ef4444" }}>💸 Refund</span>
                        {" on "}
                        <span style={{ color: "#f97316" }}>{b.campaignTitle}</span>
                        <span style={{ color: "#8a8498", fontSize: 12 }}> ({b.backerCount} backers)</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: "#8a8498", fontFamily: "monospace", fontSize: 12 }}>
                          {(b.address || "").slice(0, 8)}...
                        </span>
                        {" backed "}
                        <span style={{ color: "#f97316" }}>{b.campaignTitle}</span>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#5c5672", marginTop: 2 }}>
                    {b.date ? new Date(b.date).toLocaleDateString() : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: b.type === "refund" ? "#ef4444" : "#22c55e" }}>
                    {b.type === "refund" ? "-" : "+"}{b.amount} STRK
                  </span>
                  {b.tx_hash && (
                    <a
                      href={b.explorer_url || getExplorerUrl(b.tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 11, color: "#5c5672", textDecoration: "none" }}
                    >
                      ↗
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}