/**
 * Live Auction Calculation Engine
 *
 * - Month 1: company's allocation, no bidding (matches the lakhbox model).
 * - Months 2..N: members compete in a live auction. Starting amount is the
 *   chit amount minus commission ("Maximum Available Auction Amount"); the
 *   winning (lowest) bid determines the discount, which is split evenly
 *   across all members as a dividend that reduces next month's payment.
 */

export function getStartingAmount(plan) {
  if (!plan) return 0;
  const chitAmount = plan.chit_amount || 0;
  const commPct = plan.commission_percent || 0;
  return Math.round(chitAmount - (chitAmount * commPct) / 100);
}

export function calcAuctionOutcome({ plan, winningBid }) {
  const startingAmount = getStartingAmount(plan);
  const members = plan?.member_count || 0;
  const monthly = plan?.monthly_contribution || 0;

  const discount = startingAmount - winningBid;
  const dividendPerMember = members > 0 ? Math.round((discount / members) * 100) / 100 : 0;
  const nextInstallment = Math.round((monthly - dividendPerMember) * 100) / 100;

  return {
    startingAmount,
    discount,
    dividendPerMember,
    nextInstallment,
  };
}
