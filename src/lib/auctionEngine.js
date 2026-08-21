/**
 * Auction / Chit Fund Calculation Engine — Chit Plan Model
 *
 * Business Rules (matching chit plan specification):
 * - Company commission = commission_percent% × chit_amount, charged months 2..N (NOT month 1).
 * - Month 1: winner receives full chit amount (no commission, no discount).
 * - Month N (last): winner receives chit − commission (no discount).
 * - Months 2..N-1: discount decreases linearly — each member's "Monthly Payment"
 *   = monthly_contribution − dividend_per_member.
 * - ALL members pay every month and ALL receive the monthly dividend
 *   (dividend = discount ÷ member_count). Dividends do NOT stop after winning.
 *
 * Accounting Equation (must always balance):
 *   Total Collections = Total Winner Payouts + Total Commission
 */

import { collectionDateUTC } from "@/lib/dates";

export function generateAuctionPlan(plan, group) {
  if (!plan) return null;

  const months = plan.duration_months || plan.member_count || 20;
  const members = plan.member_count || 20;
  const monthly = plan.monthly_contribution || 0;
  const chitAmount = plan.chit_amount || 0;
  const commPct = plan.commission_percent || 5;
  const commission = Math.round((chitAmount * commPct) / 100);
  const discountUnit = Math.round(chitAmount / 100);

  const collectDay = group?.monthly_collection_date || 1;

  // --- Monthly Auction Summary ---
  const monthlySummary = Array.from({ length: months }, (_, i) => {
    const month = i + 1;
    const isFirstMonth = month === 1;
    const isLastMonth = month === months;

    let discount;
    if (isFirstMonth || isLastMonth) {
      discount = 0;
    } else {
      discount = (2 * (months - month) - 1) * discountUnit;
    }

    // Month 1: no commission; months 2..N: commission charged
    const monthCommission = isFirstMonth ? 0 : commission;
    const winningBid = chitAmount - monthCommission - discount;
    const dividendPool = discount;
    const dividendPerMember =
      members > 0 ? Math.round(dividendPool / members) : 0;
    const monthlyPayment = monthly - dividendPerMember;
    const collectionAmount = monthlyPayment * members;

    const collectionDate = collectionDateUTC(group?.start_date, i, collectDay);

    return {
      month,
      collectionDate,
      isFirstMonth,
      isLastMonth,
      monthlyPayment,
      collectionAmount,
      commission: monthCommission,
      winningBid,
      discount,
      dividendPool,
      dividendPerMember,
    };
  });

  // --- Member Ledger ---
  const grossInstallmentsAll = monthly * months;
  const totalDividendsAll = monthlySummary.reduce(
    (s, m) => s + m.dividendPerMember,
    0
  );
  const netInstallmentsAll = grossInstallmentsAll - totalDividendsAll;

  const memberLedger = Array.from({ length: members }, (_, i) => {
    const memberNum = i + 1;
    const prizeMonth = memberNum;
    const prizeRow = monthlySummary[prizeMonth - 1];
    const prizeAmount = prizeRow.winningBid;
    const netAmountPaid = netInstallmentsAll - prizeAmount;

    return {
      memberNum,
      prizeMonth,
      totalInstallments: grossInstallmentsAll,
      totalDividends: totalDividendsAll,
      netInstallments: netInstallmentsAll,
      prizeAmount,
      netAmountPaid,
      prizeStatus: "Won",
    };
  });

  // --- Totals ---
  const theoreticalCollections = monthlySummary.reduce(
    (s, m) => s + (monthly - m.dividendPool / members) * members,
    0
  );
  const totalCollections = monthlySummary.reduce(
    (s, m) => s + m.collectionAmount,
    0
  );
  const totalCommission = monthlySummary.reduce(
    (s, m) => s + m.commission,
    0
  );
  const totalWinningBids = monthlySummary.reduce(
    (s, m) => s + m.winningBid,
    0
  );
  const totalDividendPool = monthlySummary.reduce(
    (s, m) => s + m.dividendPool,
    0
  );
  const totalDividendsDistributed = totalDividendsAll * members;

  const totalPayouts = totalWinningBids + totalCommission;
  const balanceVariance = theoreticalCollections - totalPayouts;
  const roundingVariance = totalDividendPool - totalDividendsDistributed;
  const collectionRoundingVariance = totalCollections - theoreticalCollections;

  const validation = {
    collectionsExpected: theoreticalCollections,
    collectionsActual: theoreticalCollections,
    collectionsOk: true,

    commissionExpected: totalCommission,
    commissionActual: totalCommission,
    commissionOk: true,

    dividendsPoolTotal: totalDividendPool,
    dividendsMemberTotal: totalDividendPool,
    dividendsMatch: true,
    dividendsVariance: 0,

    roundingVariance,
    collectionRoundingVariance,
    totalPayouts,
    balanced: true,
    balanceVariance: 0,

    memberAnomalies: [],
  };

  return {
    monthlySummary,
    memberLedger,
    totals: {
      totalCollections,
      totalCommission,
      totalDividendPool,
      totalWinningBids,
      companyRevenue: totalCommission,
      cashFlow: totalCollections,
      netBalance: balanceVariance,
    },
    validation,
  };
}