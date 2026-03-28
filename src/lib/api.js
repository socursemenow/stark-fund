// ═══════════════════════════════════════════════════════════
// src/lib/api.js — Backend API wrapper
// Original endpoints + escrow release/vote/history
// ═══════════════════════════════════════════════════════════

const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

export const api = {
  // ── Campaign CRUD (original) ──────────────────────────────────────
  getCampaigns: () => request("/campaigns"),

  getCampaign: (id) => request(`/campaigns/${id}`),

  createCampaign: (data) =>
    request("/campaigns", { method: "POST", body: JSON.stringify(data) }),

  // ── Fund: record backer contribution (original) ───────────────────
  recordContribution: (campaignId, data) =>
    request(`/campaigns/${campaignId}/fund`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ── Stake: record staking activation (original) ───────────────────
  recordStake: (campaignId, data) =>
    request(`/campaigns/${campaignId}/stake`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ── Refund: mark campaign as refunded (original — now escrow-aware)
  // Accepts optional { caller, reason } for escrow validation
  // Still works with no body for backwards compat
  refundCampaign: (campaignId, data) =>
    request(`/campaigns/${campaignId}/refund`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  // ── Escrow: Release funds to founder ──────────────────────────────
  // Server validates: goal met + caller is founder + not already released
  // Returns { success, releaseTxHash?, netAmount, fee } or { queued: true }
  requestRelease: (campaignId, { founder }) =>
    request(`/campaigns/${campaignId}/release`, {
      method: "POST",
      body: JSON.stringify({ founder }),
    }),

  // ── Escrow: Cast refund vote ──────────────────────────────────────
  // Server validates: caller is a backer, not already voted
  // Returns { success, votesFor, votesNeeded, backerCount, refundTriggered }
  castVote: (campaignId, { voter, txHash }) =>
    request(`/campaigns/${campaignId}/vote`, {
      method: "POST",
      body: JSON.stringify({ voter, txHash }),
    }),

  // ── Escrow: Get vote status ───────────────────────────────────────
  // Returns { votes[], voteCount, backerCount, votesNeeded, passed }
  getVoteStatus: (campaignId) =>
    request(`/campaigns/${campaignId}/votes`),

  // ── Backer history ────────────────────────────────────────────────
  // Returns contributions across all campaigns for a given address
  getBackerHistory: (address) =>
    request(`/backers/${address}/history`),
};