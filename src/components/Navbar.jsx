import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useWalletStore } from "../hooks/useWallet";

export default function Navbar({ user, onLogin, onLogout }) {
  const navigate = useNavigate();
  const fullAddress = useWalletStore((s) => s.address);

  const displayName =
    user?.google?.name ||
    user?.twitter?.username ||
    user?.name ||
    user?.email?.address?.split("@")[0] ||
    user?.address?.slice(0, 10) ||
    "anon";

  const handleCopyAddress = async () => {
    if (!fullAddress) return;
    try {
      await navigator.clipboard.writeText(fullAddress);
      toast.success("Address copied!");
    } catch {
      prompt("Your wallet address:", fullAddress);
    }
  };

  return (
    <nav className="max-w-[840px] mx-auto px-5 py-4 flex justify-between items-center">
      <div
        onClick={() => navigate("/explore")}
        className="flex items-center gap-2 cursor-pointer"
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <path d="M13 2L4 14h7l-2 8 11-12h-7l2-8z" fill="#f97316" fillOpacity="0.9" />
        </svg>
        <span className="text-lg font-extrabold text-[#f5f3fa] tracking-tight">
          Stark<span className="text-orange-500">Fund</span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <>
            <button
              onClick={() => navigate("/dashboard")}
              className="text-xs text-[#8a8498] hover:text-orange-400 transition-colors font-semibold"
            >
              Dashboard
            </button>
            <div
              onClick={handleCopyAddress}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] rounded-lg border border-white/[0.06] cursor-pointer hover:border-orange-500/20 transition-all"
              title="Click to copy full address"
            >
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
              <span className="text-sm text-[#e8e4ef] font-semibold max-w-[150px] truncate">
                {displayName}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="text-xs text-[#5c5672] hover:text-[#8a8498] transition-colors"
            >
              Logout
            </button>
          </>
        ) : (
          <button
            onClick={onLogin}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-br from-orange-500 to-orange-600 shadow-[0_2px_12px_rgba(249,115,22,0.25)] transition-all"
          >
            Sign in
          </button>
        )}
      </div>
    </nav>
  );
}