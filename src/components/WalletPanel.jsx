import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useWalletStore, useWallet } from "../hooks/useWallet";
import SwapModal from "./SwapModal";
import StakeModal from "./StakeModal";

export default function WalletPanel() {
  const { address, balances, staked, connected } = useWalletStore();
  const { refreshBalances } = useWallet();
  const [swapOpen, setSwapOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);

  // Refresh balances on mount
  useEffect(() => {
    if (connected) refreshBalances();
  }, [connected]);

  const strk = balances?.STRK || "0";
  const stakedAmt = staked || "0";
  const shortAddr = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "connecting...";

  const handleCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied!");
    } catch {
      // Fallback
      prompt("Your wallet address:", address);
    }
  };

  return (
    <>
      <div className="bg-[rgba(20,16,28,0.7)] backdrop-blur border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500/80 to-orange-600/60 flex items-center justify-center text-sm font-bold text-white">
            ⚡
          </div>
          <div>
            <div className="text-sm font-bold text-[#f5f3fa]">My Wallet</div>
            <button
              onClick={handleCopyAddress}
              className="text-[11px] text-[#5c5672] font-mono hover:text-orange-400 transition-colors cursor-pointer"
              title="Click to copy full address"
              style={{ background: "none", border: "none", padding: 0, fontFamily: "monospace" }}
            >
              {shortAddr} 📋
            </button>
          </div>
          <div className="ml-auto w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/15">
            <div className="text-[11px] text-orange-500 mb-0.5">Available</div>
            <div className="text-lg font-bold text-[#f5f3fa]">
              {strk} <span className="text-[11px] font-normal text-[#5c5672]">STRK</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/15">
            <div className="text-[11px] text-green-500 mb-0.5">Staked</div>
            <div className="text-lg font-bold text-[#f5f3fa]">
              {stakedAmt} <span className="text-[11px] font-normal text-[#5c5672]">STRK</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setStakeOpen(true)}
            className="flex-1 py-2 rounded-xl text-[13px] font-semibold text-[#8a8498] bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] hover:text-green-400 transition-all"
          >
            📈 Stake
          </button>
          <button
            onClick={() => setSwapOpen(true)}
            className="flex-1 py-2 rounded-xl text-[13px] font-semibold text-[#8a8498] bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] hover:text-orange-400 transition-all"
          >
            🔄 Swap
          </button>
        </div>
      </div>

      <SwapModal open={swapOpen} onClose={() => setSwapOpen(false)} />
      <StakeModal
        open={stakeOpen}
        onClose={() => setStakeOpen(false)}
        campaign={{ id: "wallet", raised: parseFloat(strk) || 0, title: "Wallet" }}
      />
    </>
  );
}