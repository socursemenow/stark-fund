import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCampaignStore } from "../hooks/useCampaigns";
import CampaignCard from "../components/CampaignCard";
import WalletPanel from "../components/WalletPanel";
import CreateModal from "../components/CreateModal";
import { useWalletStore } from "../hooks/useWallet";

export default function Explore({ user }) {
  const navigate = useNavigate();
  const { campaigns, fetchCampaigns, initialized, loading } = useCampaignStore();
  const connected = useWalletStore((s) => s.connected);
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  // Fetch campaigns from API on mount
  useEffect(() => {
    if (!initialized) {
      fetchCampaigns();
    }
  }, [initialized]);

  const filtered =
    tab === "all"
      ? campaigns
      : tab === "funded"
      ? campaigns.filter((c) => c.raised >= c.goal)
      : campaigns.filter((c) => c.raised < c.goal);

  return (
    <div className="max-w-[840px] mx-auto px-5 pb-16 pt-4">
      {connected && (
        <div className="mb-6">
          <WalletPanel />
        </div>
      )}

      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <h2 className="text-xl font-bold text-[#f5f3fa]">Campaigns</h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[
              { id: "all", label: "All" },
              { id: "active", label: "Active" },
              { id: "funded", label: "Funded" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === t.id
                    ? "bg-orange-500/12 text-orange-500"
                    : "text-[#5c5672] hover:text-[#8a8498]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {connected && (
            <button
              onClick={() => setCreateOpen(true)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-br from-orange-500 to-orange-600 shadow-[0_2px_12px_rgba(249,115,22,0.25)] hover:shadow-[0_4px_20px_rgba(249,115,22,0.4)] transition-all"
            >
              + Launch
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div style={{ width: 32, height: 32, border: "3px solid #f97316", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 12px", animation: "sp .8s linear infinite" }} />
          <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
          <p style={{ color: "#8a8498", fontSize: 14 }}>Loading campaigns...</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <CampaignCard key={c.id} campaign={c} onClick={() => navigate(`/campaign/${c.id}`)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-[#5c5672]">
          <p className="text-4xl mb-3">⚡</p>
          <p className="text-lg font-semibold text-[#8a8498] mb-1">No campaigns yet</p>
          <p className="text-sm mb-5">Be the first to launch one and start raising STRK!</p>
          {connected && (
            <button
              onClick={() => setCreateOpen(true)}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-br from-orange-500 to-orange-600 shadow-[0_2px_12px_rgba(249,115,22,0.25)]"
            >
              + Launch Campaign
            </button>
          )}
        </div>
      )}

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}