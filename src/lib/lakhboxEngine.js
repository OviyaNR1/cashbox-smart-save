/**
 * LakhBox Calculation Engine
 *
 * Business Rules:
 * - Month 1: the company keeps that month's full collection as flat income
 *   (no member wins, no percentage shown).
 * - Months 2..N: member `month` wins that month. All members pay the same
 *   fixed monthly contribution for the full duration regardless of when
 *   they win (no dividend redistribution, unlike the chit-fund model).
 * - Winner payout scales linearly around a breakeven month at N/2 + 2,
 *   in steps of totalPaid/100.
 */

export function generateLakhBoxPlan(plan) {
  if (!plan) return null;

  const members = plan.member_count || 20;
  const monthly = plan.monthly_contribution || 0;
  const companyLabel = plan.company_label || "CashBox";
  const totalPaid = monthly * members;
  const discountUnit = Math.round(totalPaid / 100);

  const monthlySummary = Array.from({ length: members }, (_, i) => {
    const month = i + 1;
    const isCompanyMonth = month === 1;
    const winnerPayout = isCompanyMonth
      ? totalPaid
      : totalPaid + discountUnit * (month - 2 - members / 2);
    const profitLoss = isCompanyMonth ? totalPaid : winnerPayout - totalPaid;

    return {
      month,
      isCompanyMonth,
      winnerLabel: isCompanyMonth ? companyLabel : `Member ${month}`,
      winnerPayout,
      memberMonthlyPayment: monthly,
      memberTotalPaid: totalPaid,
      profitLoss,
      profitLossPct: isCompanyMonth ? null : (profitLoss / totalPaid) * 100,
    };
  });

  const totalCompanyIncome = monthlySummary[0].profitLoss;
  const totalMemberProfitLoss = monthlySummary
    .slice(1)
    .reduce((s, m) => s + m.profitLoss, 0);

  return {
    monthlySummary,
    totals: {
      totalPaid,
      discountUnit,
      totalCompanyIncome,
      totalMemberProfitLoss,
    },
  };
}
