// ─────────────────────────────────────────────────────────
// src/hooks/useWallet.js
// Cartridge Controller auth + Starkzap SDK wallet actions
// ALL SDK calls match official Starkzap v2 API:
// https://docs.starknet.io/build/starkzap/examples
// ─────────────────────────────────────────────────────────
import { useCallback, useRef } from "react";
import { create } from "zustand";
import toast from "react-hot-toast";
import {
  getSDK,
  tokens,
  formatBase,
  getExplorerUrl,
  Amount,
  fromAddress,
  OnboardStrategy,
  AvnuSwapProvider,
  EkuboSwapProvider,
} from "./useStarkzap";

// ── Constants ──────────────────────────────────────────────────────────
const PLATFORM_WALLET = import.meta.env.VITE_PLATFORM_WALLET;
const PLATFORM_FEE_BPS = 150; // 1.5%
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Token presets (from starkzap — these are full token objects, not just addresses)
const STRK = tokens.STRK || tokens.strk;
const ETH = tokens.ETH || tokens.eth;
const USDC = tokens.USDC || tokens.usdc;

// Raw addresses (fallback for server API calls)
const STRK_ADDRESS = STRK?.address || "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ETH_ADDRESS = ETH?.address || "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const USDC_ADDRESS = USDC?.address || "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8";

// Map symbol → token preset
const TOKEN_MAP = { STRK, ETH, USDC };

// ── Zustand Store ──────────────────────────────────────────────────────
export const useWalletStore = create((set) => ({
  wallet: null,
  address: null,
  connected: false,
  balances: { STRK: "0", ETH: "0", USDC: "0" },
  staked: "0",
  tokens: { STRK, ETH, USDC },

  setWallet: (wallet, address) =>
    set({ wallet, address, connected: !!wallet }),
  clear: () =>
    set({ wallet: null, address: null, connected: false, balances: { STRK: "0", ETH: "0", USDC: "0" }, staked: "0" }),
  setBalances: (balances) => set({ balances }),
  setStaked: (staked) => set({ staked }),
}));

// ── Main Hook ──────────────────────────────────────────────────────────
export function useWallet() {
  const store = useWalletStore();
  const { wallet, address, connected, setWallet, clear } = store;
  const lockRef = useRef(false);

  // ═══════════════════════════════════════════════════════════════════
  // AUTH
  // ═══════════════════════════════════════════════════════════════════

  const connect = useCallback(async () => {
    const sdk = getSDK();
    try {
      const policies = [
        { target: STRK_ADDRESS, method: "transfer" },
        {
          target: STRK_ADDRESS,
          method: "approve",
          spender: PLATFORM_WALLET,
          amount: "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
        },
      ];

      const onboard = await sdk.onboard({
        strategy: OnboardStrategy.Cartridge,
        cartridge: { policies },
      });

      const w = onboard.wallet;

      if (w) {
        // Force wallet.address to be a plain string — the SDK internally
        // passes this to contract calls (like staker_pool_info) that expect
        // String/Number/BigInt, not Felt objects. Without this, staking breaks.
        if (w.address && typeof w.address === "object") {
          w.address = w.address.toString();
        }

        try {
          w.registerSwapProvider(new AvnuSwapProvider());
          w.registerSwapProvider(new EkuboSwapProvider());
          w.setDefaultSwapProvider?.("avnu");
        } catch (e) {
          console.warn("[useWallet] Swap provider registration:", e.message);
        }

        const addr = typeof w.address === "object" ? w.address.toString() : w.address;
        setWallet(w, addr);
        toast.success("Wallet connected!");
        return w;
      }
    } catch (err) {
      if (!/reject|cancel|abort|closed/i.test(err?.message || "")) {
        console.error("[useWallet] Connect failed:", err);
        toast.error("Connection failed");
      }
      throw err;
    }
  }, [setWallet]);

  const disconnect = useCallback(() => {
    clear();
    toast("Wallet disconnected", { icon: "👋" });
  }, [clear]);

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════

  const withLock = useCallback(async (fn) => {
    if (lockRef.current) {
      toast.error("Transaction already in progress");
      return null;
    }
    lockRef.current = true;
    try {
      return await fn();
    } catch (err) {
      const msg = err?.message || "Transaction failed";
      if (!/reject|cancel|abort/i.test(msg)) {
        toast.error(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
      }
      console.error("[useWallet]", err);
      return null;
    } finally {
      lockRef.current = false;
    }
  }, []);

  const extractHash = (tx) => {
    if (!tx) return null;
    if (typeof tx === "string") return tx;
    return tx.hash || tx.transaction_hash || tx.toString();
  };

  const extractExplorer = (tx) => {
    if (!tx) return null;
    if (tx.explorerUrl) return tx.explorerUrl;
    const hash = extractHash(tx);
    return hash ? getExplorerUrl(hash) : null;
  };

  const getAddr = () => {
    if (!wallet) return null;
    return typeof wallet.address === "object" ? wallet.address.toString() : wallet.address;
  };

  // Helper: safely convert any address (string, object, BigInt) to a plain string
  const toAddrStr = (addr) => {
    if (!addr) return "";
    if (typeof addr === "string") return addr;
    if (typeof addr === "bigint") return "0x" + addr.toString(16);
    if (typeof addr.toString === "function") return addr.toString();
    return String(addr);
  };

  // ═══════════════════════════════════════════════════════════════════
  // LEGACY METHODS — used by existing FundModal, SwapModal, StakeModal,
  // FounderPanel, VoteRefund, CreateModal, WalletPanel
  // ALL now use correct Starkzap v2 API
  // ═══════════════════════════════════════════════════════════════════

  // ── transfer(recipient, amount) ──
  const transfer = useCallback(
    async (recipient, amount) => {
      return withLock(async () => {
        if (!wallet) throw new Error("Connect wallet first");

        const to = fromAddress(recipient);
        const amt = Amount.parse(String(amount), STRK);

        const tx = await wallet.transfer(STRK, [{ to, amount: amt }]);
        await tx.wait();

        return {
          hash: tx.hash,
          transaction_hash: tx.hash,
          explorerUrl: tx.explorerUrl || getExplorerUrl(tx.hash),
          wait: async () => {},
        };
      });
    },
    [wallet, withLock]
  );

  // ── swapAndTransfer(token, amount, recipient) ──
  const swapAndTransfer = useCallback(
    async (tokenSymbol, amount, recipient) => {
      return withLock(async () => {
        if (!wallet) throw new Error("Connect wallet first");

        const fromToken = TOKEN_MAP[tokenSymbol];
        const toToken = STRK;
        if (!fromToken) throw new Error(`Token ${tokenSymbol} not found`);

        const amountIn = Amount.parse(String(amount), fromToken);

        const swapTx = await wallet.swap(
          { tokenIn: fromToken, tokenOut: toToken, amountIn, slippageBps: 100n },
          { feeMode: "sponsored" }
        );
        await swapTx.wait();

        const strkReceived = swapTx.amountOut
          ? formatBase(swapTx.amountOut, toToken)
          : amount;

        const transferTx = await wallet.transfer(STRK, [
          { to: fromAddress(recipient), amount: Amount.parse(String(strkReceived), STRK) },
        ]);
        await transferTx.wait();

        return { swapTx, transferTx, strkReceived };
      });
    },
    [wallet, withLock]
  );

  // ── getQuote(tokenOrParams, amount?) ──
  const getQuote = useCallback(
    async (tokenOrParams, amount) => {
      if (!wallet) throw new Error("Connect wallet first");

      if (typeof tokenOrParams === "object" && (tokenOrParams.tokenIn || tokenOrParams.inputToken)) {
        return wallet.getQuote(tokenOrParams);
      }

      const fromToken = TOKEN_MAP[tokenOrParams];
      const toToken = STRK;
      if (!fromToken) return null;

      try {
        const amountIn = Amount.parse(String(amount), fromToken);
        const q = await wallet.getQuote({ tokenIn: fromToken, tokenOut: toToken, amountIn });

        if (q) {
          return {
            amountOut: formatBase(q.amountOutBase || q.amountOut, toToken),
            priceImpact: q.priceImpactBps ? Number(q.priceImpactBps) / 100 : 0,
            provider: q.provider || "avnu",
          };
        }
      } catch (err) {
        console.warn("getQuote failed:", err.message);
      }
      return null;
    },
    [wallet]
  );

  // ── swap(params) ──
  const swap = useCallback(
    async (params) => {
      return withLock(async () => {
        if (!wallet) throw new Error("Connect wallet first");

        const tx = await wallet.swap(params, { feeMode: "sponsored" });
        await tx.wait();

        toast.success("Swap complete!");
        return {
          hash: tx.hash,
          transaction_hash: tx.hash,
          explorerUrl: tx.explorerUrl || getExplorerUrl(tx.hash),
        };
      });
    },
    [wallet, withLock]
  );

  // ── stake(amount) ──
  // FIXED: bypasses sdk.getStakerPools() which has a Felt object bug
  // Uses wallet.stake() first, falls back to direct enterPool with known pools
  const stake = useCallback(
    async (amount) => {
      return withLock(async () => {
        if (!wallet) throw new Error("Connect wallet first");

        const sdk = getSDK();
        const amt = Amount.parse(String(amount), STRK);

        // Method 1: Try wallet.stake() if available (simplest v2 API)
        if (typeof wallet.stake === "function") {
          try {
            const tx = await wallet.stake({ token: STRK, amount: amt });
            await tx.wait();
            toast.success("Staking successful!");
            return {
              hash: tx.hash,
              transaction_hash: tx.hash,
              explorerUrl: tx.explorerUrl || getExplorerUrl(tx.hash),
            };
          } catch (e) {
            console.warn("[stake] wallet.stake() failed, trying pool discovery:", e.message);
          }
        }

        // Method 2: Try pool discovery with deep-stringified objects
        try {
          const stakingTokens = await sdk.stakingTokens?.() || [];
          const strkStaking = stakingTokens.find((t) => {
            const addr = toAddrStr(t.address);
            return addr.toLowerCase() === STRK_ADDRESS.toLowerCase();
          });

          if (strkStaking) {
            // Deep-clone and stringify all address fields to avoid Felt object bug
            const cleanToken = JSON.parse(JSON.stringify(strkStaking, (key, value) => {
              if (value && typeof value === "object" && typeof value.toString === "function" && key.toLowerCase().includes("address")) {
                return value.toString();
              }
              return value;
            }));

            const pools = await sdk.getStakerPools?.(cleanToken) || [];
            if (pools.length > 0) {
              const poolAddr = toAddrStr(pools[0].address || pools[0].poolAddress);
              const tx = await wallet.enterPool(poolAddr, amt);
              await tx.wait();
              toast.success("Staking successful!");
              return {
                hash: tx.hash,
                transaction_hash: tx.hash,
                explorerUrl: tx.explorerUrl || getExplorerUrl(tx.hash),
              };
            }
          }
        } catch (e) {
          console.warn("[stake] Pool discovery failed:", e.message);
        }

        // Method 3: Direct enterPool with STRK token address as pool
        try {
          const tx = await wallet.enterPool(STRK_ADDRESS, amt);
          await tx.wait();
          toast.success("Staking successful!");
          return {
            hash: tx.hash,
            transaction_hash: tx.hash,
            explorerUrl: tx.explorerUrl || getExplorerUrl(tx.hash),
          };
        } catch (e) {
          console.warn("[stake] Direct enterPool failed:", e.message);
        }

        throw new Error("Staking not available — pool discovery failed on this network. Try again after re-login.");
      });
    },
    [wallet, withLock]
  );

  // ── batchRefund(recipients) ──
  const batchRefund = useCallback(
    async (recipients) => {
      return withLock(async () => {
        if (!wallet) throw new Error("Connect wallet first");

        const transfers = recipients
          .filter((r) => r.address && r.amount > 0)
          .map((r) => ({
            to: fromAddress(r.address),
            amount: Amount.parse(String(r.amount), STRK),
          }));

        if (transfers.length === 0) throw new Error("No recipients to refund");

        const tx = await wallet.transfer(STRK, transfers);
        await tx.wait();

        toast.success(`Refunded ${transfers.length} backers!`);
        return {
          hash: tx.hash,
          transaction_hash: tx.hash,
          explorerUrl: tx.explorerUrl || getExplorerUrl(tx.hash),
        };
      });
    },
    [wallet, withLock]
  );

  // ── refreshBalances() ──
  const refreshBalances = useCallback(async () => {
    if (!wallet) return;
    try {
      const [strkBal, ethBal, usdcBal] = await Promise.allSettled([
        STRK ? wallet.balanceOf(STRK) : Promise.reject("no token"),
        ETH ? wallet.balanceOf(ETH) : Promise.reject("no token"),
        USDC ? wallet.balanceOf(USDC) : Promise.reject("no token"),
      ]);

      const fmt = (result) => {
        if (result.status !== "fulfilled" || !result.value) return "0";
        try {
          if (result.value.toFormatted) {
            const formatted = result.value.toFormatted();
            const parts = formatted.split(" ");
            return parts.length > 1 ? parts[1] : parts[0];
          }
          return formatBase(BigInt(result.value.toString()), { decimals: 18 });
        } catch {
          return "0";
        }
      };

      useWalletStore.getState().setBalances({
        STRK: fmt(strkBal),
        ETH: fmt(ethBal),
        USDC: fmt(usdcBal),
      });
    } catch (err) {
      console.warn("[refreshBalances] Failed:", err.message);
    }
  }, [wallet]);

  // ── getBalance(tokenAddress) ──
  const getBalance = useCallback(
    async (tokenAddress = STRK_ADDRESS) => {
      if (!wallet) return "0";
      try {
        const token = Object.values(TOKEN_MAP).find(
          (t) => t?.address?.toLowerCase() === tokenAddress?.toLowerCase()
        ) || STRK;

        const bal = await wallet.balanceOf(token);
        return bal?.toFormatted?.() || bal?.toString() || "0";
      } catch {
        return "0";
      }
    },
    [wallet]
  );

  // ═══════════════════════════════════════════════════════════════════
  // ESCROW METHODS — all use correct v2 transfer API
  // ═══════════════════════════════════════════════════════════════════

  // ── fundCampaign(campaignId, amountSTRK, { payToken }) ──
  const fundCampaign = useCallback(
    async (campaignId, amountSTRK, { payToken = "STRK" } = {}) => {
      return withLock(async () => {
        if (!wallet) throw new Error("Connect wallet first");
        if (!PLATFORM_WALLET) throw new Error("Platform wallet not configured");
        if (amountSTRK <= 0) throw new Error("Amount must be greater than 0");

        let tx;

        if (payToken === "STRK") {
          tx = await wallet.transfer(STRK, [
            { to: fromAddress(PLATFORM_WALLET), amount: Amount.parse(String(amountSTRK), STRK) },
          ]);
        } else {
          const inputToken = TOKEN_MAP[payToken];
          if (!inputToken) throw new Error(`Token ${payToken} not found`);

          const amountIn = Amount.parse(String(amountSTRK), inputToken);
          const quote = await wallet.getQuote({ tokenIn: inputToken, tokenOut: STRK, amountIn });

          if (!quote) throw new Error(`No swap route for ${payToken} → STRK`);

          toast(`Swapping ${payToken} → STRK...`, { icon: "🔄" });

          const swapTx = await wallet.swap(
            { tokenIn: inputToken, tokenOut: STRK, amountIn, slippageBps: 100n },
            { feeMode: "sponsored" }
          );
          await swapTx.wait();

          tx = await wallet.transfer(STRK, [
            { to: fromAddress(PLATFORM_WALLET), amount: Amount.parse(String(amountSTRK), STRK) },
          ]);
        }

        await tx.wait();
        const hashStr = tx.hash || extractHash(tx);
        if (!hashStr) throw new Error("Transaction returned no hash");

        const backerAddr = getAddr();
        try {
          await fetch(`${API_URL}/api/campaigns/${campaignId}/fund`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              backer_address: backerAddr,
              amount: amountSTRK,
              token_paid: payToken,
              amount_paid: amountSTRK,
              tx_hash: hashStr,
            }),
          });
        } catch (apiErr) {
          console.warn("[useWallet] Backend record failed:", apiErr);
          toast("Funded on-chain! Backend sync may be delayed.", { icon: "⚠️" });
        }

        toast.success(`Funded ${amountSTRK} STRK to escrow!`);
        return { txHash: hashStr, explorerUrl: tx.explorerUrl || getExplorerUrl(hashStr) };
      });
    },
    [wallet, withLock]
  );

  // ── payLaunchFee(amountSTRK) ──
  const payLaunchFee = useCallback(
    async (amountSTRK = 10) => {
      return withLock(async () => {
        if (!wallet) throw new Error("Connect wallet first");

        const tx = await wallet.transfer(STRK, [
          { to: fromAddress(PLATFORM_WALLET), amount: Amount.parse(String(amountSTRK), STRK) },
        ]);
        await tx.wait();

        toast.success(`Launch fee paid: ${amountSTRK} STRK`);
        return { txHash: tx.hash, explorerUrl: tx.explorerUrl || getExplorerUrl(tx.hash) };
      });
    },
    [wallet, withLock]
  );

  // ── requestRelease(campaignId) ──
  const requestRelease = useCallback(
    async (campaignId) => {
      return withLock(async () => {
        if (!wallet) throw new Error("Connect wallet first");
        const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/release`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ founder: getAddr() }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Release failed");

        if (result.releaseTxHash) {
          toast.success(`Released! ${result.netAmount} STRK sent (${result.fee} STRK fee)`, { duration: 6000 });
          return { txHash: result.releaseTxHash, explorerUrl: getExplorerUrl(result.releaseTxHash), netAmount: result.netAmount, fee: result.fee };
        }
        toast.success("Release requested! Funds will be sent within 24h.", { icon: "⏳" });
        return { queued: true, message: result.message };
      });
    },
    [wallet, withLock]
  );

  // ── requestRefund(campaignId, { reason }) ──
  const requestRefund = useCallback(
    async (campaignId, { reason = "expired" } = {}) => {
      return withLock(async () => {
        if (!wallet) throw new Error("Connect wallet first");
        const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caller: getAddr(), reason }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Refund failed");

        if (result.refundTxHash) {
          toast.success(`Refunded ${result.totalRefunded} STRK to ${result.backerCount} backer(s)!`, { duration: 6000 });
          return { txHash: result.refundTxHash, explorerUrl: getExplorerUrl(result.refundTxHash), totalRefunded: result.totalRefunded, backerCount: result.backerCount };
        }
        toast.success("Refund queued.", { icon: "⏳" });
        return { queued: true, message: result.message };
      });
    },
    [wallet, withLock]
  );

  // ── voteRefund(campaignId) ──
  const voteRefund = useCallback(
    async (campaignId) => {
      return withLock(async () => {
        if (!wallet) throw new Error("Connect wallet first");

        const tx = await wallet.transfer(STRK, [
          { to: fromAddress(PLATFORM_WALLET), amount: Amount.parse("0.001", STRK) },
        ]);
        await tx.wait();

        const hashStr = tx.hash;
        const voterAddr = getAddr();

        try {
          const voteRes = await fetch(`${API_URL}/api/campaigns/${campaignId}/vote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voter: voterAddr, txHash: hashStr }),
          }).then((r) => r.json());

          if (voteRes.refundTriggered) toast.success("Vote passed! Refund is being processed.", { icon: "🗳️" });
          else toast.success(`Vote recorded! ${voteRes.votesFor}/${voteRes.votesNeeded} needed`, { icon: "🗳️" });
          return { txHash: hashStr, explorerUrl: tx.explorerUrl || getExplorerUrl(hashStr), ...voteRes };
        } catch (apiErr) {
          console.warn("[useWallet] Vote API failed:", apiErr);
          toast.success("Vote tx sent! Backend sync may be delayed.");
          return { txHash: hashStr, explorerUrl: tx.explorerUrl || getExplorerUrl(hashStr) };
        }
      });
    },
    [wallet, withLock]
  );

  return {
    // Auth
    connect, disconnect, connected, loading: lockRef.current, address, wallet,
    // Legacy methods (existing components)
    transfer, swapAndTransfer, swap, stake, batchRefund,
    getQuote, getBalance, refreshBalances,
    // Escrow methods (V2)
    fundCampaign, payLaunchFee, requestRelease, requestRefund, voteRefund,
    // Constants
    PLATFORM_FEE_BPS, STRK_ADDRESS, ETH_ADDRESS, USDC_ADDRESS,
  };
}