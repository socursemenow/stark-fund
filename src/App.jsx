// ─────────────────────────────────────────────────────────
// src/App.jsx — Cartridge Controller auth + Starkzap SDK
// ─────────────────────────────────────────────────────────
import { Routes, Route, useNavigate } from "react-router-dom";
import { useWallet, useWalletStore } from "./hooks/useWallet";
import { useAutoRefund } from "./hooks/useAutoRefund";
import Landing from "./pages/Landing";
import Explore from "./pages/Explore";
import Campaign from "./pages/Campaign";
import Dashboard from "./pages/Dashboard";
import Navbar from "./components/Navbar";

export default function App() {
  const { connect, disconnect, connected, loading } = useWallet();
  const address = useWalletStore((s) => s.address);
  const navigate = useNavigate();

  // Auto-refund expired campaigns
  useAutoRefund();

  const handleLogin = async () => {
    try {
      await connect();
      // Cartridge popup opens → user signs in → wallet connected
      navigate("/explore");
    } catch (err) {
      console.error("Login failed:", err);
      // User closed the Cartridge popup — that's fine
    }
  };

  const handleLogout = () => {
    disconnect();
    navigate("/");
  };

  // Build a user-like object from wallet state for components
  const user = connected
    ? { name: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "connected", address }
    : null;

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#07060b",
        color: "#e8e4ef",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <Routes>
        <Route
          path="/"
          element={
            <Landing
              onLogin={handleLogin}
              loading={loading}
              authenticated={connected}
            />
          }
        />
        <Route
          path="/explore"
          element={
            <>
              <Navbar user={user} onLogin={handleLogin} onLogout={handleLogout} />
              <Explore user={user} />
            </>
          }
        />
        <Route
          path="/campaign/:id"
          element={
            <>
              <Navbar user={user} onLogin={handleLogin} onLogout={handleLogout} />
              <Campaign user={user} />
            </>
          }
        />
        <Route
          path="/dashboard"
          element={
            <>
              <Navbar user={user} onLogin={handleLogin} onLogout={handleLogout} />
              <Dashboard user={user} />
            </>
          }
        />
      </Routes>

      {/* SDK status badge */}
      <div
        style={{
          position: "fixed", bottom: 14, right: 14, padding: "6px 14px",
          background: "rgba(7,6,11,0.9)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(249,115,22,0.2)", borderRadius: 8,
          fontSize: 11, color: "#f97316", fontWeight: 700,
          display: "flex", alignItems: "center", gap: 6, zIndex: 50,
        }}
      >
        ⚡ Powered by Starkzap
        {connected && <span style={{ color: "#22c55e" }}>● Live</span>}
      </div>
    </div>
  );
}