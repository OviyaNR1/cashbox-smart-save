import { generateAuctionPlan } from "@/lib/auctionEngine";
import { calcAuctionOutcome } from "@/lib/liveAuctionEngine";
import { collectionDateUTC } from "@/lib/dates";

function computeCollectionDate(group, monthIndex) {
  return collectionDateUTC(group?.start_date, monthIndex, group?.monthly_collection_date);
}

// The rate for a specific live-auction installment: the auction that
// decides THAT month's winner is run and closed a month ahead (while the
// group is still sitting on the prior month), so its result is already
// known by the time this installment becomes due — every member sees the
// discounted price from day one of the month, not a full-rate placeholder.
// Overdue installments stay locked to what they actually cost at the time.
function liveAuctionInstallmentRate(installmentNumber, plan, group, auctions) {
  const closedAuction = (auctions || []).find(
    (a) => a.group_id === group?.id && a.month_number === installmentNumber && a.status === "closed"
  );
  if (!closedAuction) return { amount: plan.monthly_contribution || 0, dividend: 0 };
  const outcome = calcAuctionOutcome({ plan, winningBid: closedAuction.winning_bid_amount });
  return { amount: outcome.nextInstallment, dividend: outcome.dividendPerMember };
}

// Turns a model's raw "every unpaid installment through current_month" list
// into the returned preview shape — shared so all three models derive
// next/overdue the same way. `pendingNumbers` excludes installments that
// already have a payment awaiting admin approval: paid_installments only
// advances on approval (so a pending payment can't be double-submitted),
// but that means an installment the member already paid — just not yet
// confirmed — would otherwise still show as "overdue" here too.
function deriveFromUnpaid(unpaidInstallments, pendingNumbers) {
  const list = pendingNumbers?.size
    ? unpaidInstallments.filter((i) => !pendingNumbers.has(i.number))
    : unpaidInstallments;
  const overdue = list.slice(0, -1);
  const next = list[list.length - 1];
  return {
    nextInstallment: next ? next.amount : 0,
    dividendThisMonth: next?.dividend || 0,
    dueDate: next ? next.dueDate : null,
    label: list.length > 0 ? "next" : "completed",
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((s, r) => s + r.amount, 0),
    overdueSinceDate: overdue.length > 0 ? overdue[0].dueDate : null,
    unpaidInstallments: list,
  };
}

// Single source of truth for "what does this member owe, are they behind,
// and what's their dividend this month" across all three plan models. Used
// by MyChits.jsx, MemberDashboard.jsx, and PayInstallmentDialog.jsx so the
// previewed amount and the amount actually charged can never drift apart.
//
// Every installment through the group's current month is "unpaid and
// payable now" — the last one (current_month) is the immediate "next"
// payment; any before it are "overdue". All of them price at whatever's
// current right now, not a rate frozen to their own original month.
export function getNextPaymentPreview({ membership, plan, group, auctions, pendingNumbers }) {
  const paid = membership?.paid_installments || 0;
  const currentMonth = group?.current_month || 1;
  const unpaidCount = Math.max(0, currentMonth - paid);

  if (plan?.model === "lakhbox") {
    const rate = plan.monthly_contribution || 0;
    const unpaidInstallments = Array.from({ length: unpaidCount }, (_, i) => ({
      number: paid + 1 + i,
      amount: rate,
      dueDate: computeCollectionDate(group, paid + i),
    }));
    return deriveFromUnpaid(unpaidInstallments, pendingNumbers);
  }

  if (plan?.model === "live_auction") {
    const unpaidInstallments = [];
    for (let n = paid + 1; n <= currentMonth; n++) {
      const { amount, dividend } = liveAuctionInstallmentRate(n, plan, group, auctions);
      unpaidInstallments.push({ number: n, amount, dividend, dueDate: computeCollectionDate(group, n - 1) });
    }
    return deriveFromUnpaid(unpaidInstallments, pendingNumbers);
  }

  // chit_fund — generateAuctionPlan produces the full deterministic
  // projected schedule from the plan's own parameters, so every month's
  // rate is already exact and doesn't depend on live auction state.
  const result = plan ? generateAuctionPlan(plan, group) : null;
  const rows = result?.monthlySummary?.slice(paid, paid + unpaidCount) || [];
  const unpaidInstallments = rows.map((r, i) => ({
    number: paid + 1 + i,
    amount: r.monthlyPayment,
    dividend: r.dividendPerMember,
    dueDate: r.collectionDate,
  }));
  return deriveFromUnpaid(unpaidInstallments, pendingNumbers);
}
