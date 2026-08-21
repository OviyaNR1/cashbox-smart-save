import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/currency";
import { downloadCSV } from "@/lib/csv";
import { downloadExcel } from "@/lib/excel";
import { Link } from "react-router-dom";
import { generateAuctionPlan } from "@/lib/auctionEngine";
import { generateLakhBoxPlan } from "@/lib/lakhboxEngine";
import {
  DollarSign,
  Trophy,
  Download,
  Users,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Banknote,
} from "lucide-react";
import { useAdminCountry } from "@/lib/AdminCountryContext";

export default function AuctionPlan() {
  const { country: countryFilter } = useAdminCountry();
  const [groups, setGroups] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState("");

  useEffect(() => {
    Promise.all([
      base44.entities.ChitGroup.list("-created_date", 200),
      base44.entities.ChitPlan.list("-created_date", 200),
    ]).then(([g, p]) => {
      setGroups(g);
      setPlans(p);
      setLoading(false);
    });
  }, []);

  const groupCountry = (g) => (plans.find((p) => p.id === g.plan_id)?.currency === "CAD" ? "Canada" : "India");
  const filteredGroups = groups.filter((g) => groupCountry(g) === countryFilter);

  // Re-pick a valid default whenever the country switch empties out the
  // previous selection, or on first load once groups/plans have arrived.
  useEffect(() => {
    if (filteredGroups.length && !filteredGroups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(filteredGroups[0].id);
    }
  }, [countryFilter, groups, plans]); // eslint-disable-line react-hooks/exhaustive-deps

  const group = filteredGroups.find((g) => g.id === selectedGroupId);
  const plan = plans.find((p) => p.id === group?.plan_id);
  const planCurrency = plan?.currency || "INR";
  const fmt = (amount) => formatMoney(amount, planCurrency);
  const isLakhBox = plan?.model === "lakhbox";
  const isLiveAuction = plan?.model === "live_auction";

  const result = useMemo(
    () => (isLiveAuction ? null : isLakhBox ? generateLakhBoxPlan(plan) : generateAuctionPlan(plan, group)),
    [plan, group, isLakhBox, isLiveAuction]
  );

  const buildMonthlyRows = () => {
    if (!result) return [];
    return isLakhBox
      ? result.monthlySummary.map((s) => ({
          Month: s.month,
          Winner: s.winnerLabel,
          [`Winner Payout (${planCurrency})`]: s.winnerPayout,
          [`Member Monthly Payment (${planCurrency})`]: s.memberMonthlyPayment,
          [`Premium / Bonus (${planCurrency})`]: s.profitLoss,
        }))
      : result.monthlySummary.map((s) => ({
          Month: s.month,
          "Collection Date": s.collectionDate || "",
          [`Monthly Payment / Member (${planCurrency})`]: s.monthlyPayment,
          [`Total Collection (${planCurrency})`]: s.collectionAmount,
          [`Company Commission (${planCurrency})`]: s.commission,
          [`Winner Amount (${planCurrency})`]: s.winningBid,
          [`Discount (${planCurrency})`]: s.discount,
          [`Dividend / Member (${planCurrency})`]: s.dividendPerMember,
        }));
  };

  const buildMemberRows = () => {
    if (!result || isLakhBox) return [];
    return result.memberLedger.map((m) => ({
      "Member #": m.memberNum,
      "Prize Month": m.prizeMonth,
      [`Total Installments (${planCurrency})`]: m.totalInstallments,
      [`Total Dividends (${planCurrency})`]: m.totalDividends,
      [`Prize Amount (${planCurrency})`]: m.prizeAmount,
      [`Net Amount Paid (${planCurrency})`]: m.netAmountPaid,
      "Prize Status": m.prizeStatus,
    }));
  };

  const scheduleFilename = (plan?.plan_name || "schedule").replace(/\s+/g, "_");
  const exportMonthlyCSV = () => downloadCSV(`monthly_summary_${scheduleFilename}.csv`, buildMonthlyRows());
  const exportMonthlyExcel = () => downloadExcel(`monthly_summary_${scheduleFilename}.xlsx`, buildMonthlyRows());
  const exportMemberCSV = () => downloadCSV(`member_ledger_${scheduleFilename}.csv`, buildMemberRows());
  const exportMemberExcel = () => downloadExcel(`member_ledger_${scheduleFilename}.xlsx`, buildMemberRows());

  if (loading) {
    return (
      <div className="h-64 grid place-items-center text-muted-foreground text-sm">
        Loading auction plan…
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">Auction Plan</h1>
        </div>
        <div className="bg-card rounded-2xl border border-border p-12 text-center text-sm text-muted-foreground">
          No savings groups found. Create a group first.
        </div>
      </div>
    );
  }

  if (plan && isLiveAuction) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">Auction Plan</h1>
        </div>
        <GroupSelector
          groups={filteredGroups}
          selectedGroupId={selectedGroupId}
          setSelectedGroupId={setSelectedGroupId}
        />
        <div className="bg-card rounded-2xl border border-border p-12 text-center text-sm text-muted-foreground space-y-3">
          <p>This group runs on the Live Auction model — outcomes aren't known in advance, so there's no static schedule to show here.</p>
          <Link to="/admin/live-auction" className="inline-block text-primary hover:underline text-sm font-medium">
            Go to Live Auction control panel →
          </Link>
        </div>
      </div>
    );
  }

  if (!plan || !result) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">Auction Plan</h1>
        </div>
        <GroupSelector
          groups={filteredGroups}
          selectedGroupId={selectedGroupId}
          setSelectedGroupId={setSelectedGroupId}
        />
        <div className="bg-card rounded-2xl border border-border p-12 text-center text-sm text-muted-foreground">
          {group ? "No plan assigned to this group." : "Select a group to view the auction plan."}
        </div>
      </div>
    );
  }

  const { monthlySummary } = result;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">Auction Plan</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={exportMonthlyCSV}
            className="text-sm px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Monthly CSV
          </button>
          <button
            onClick={exportMonthlyExcel}
            className="text-sm px-4 py-2 rounded-full border border-border text-foreground hover:bg-muted flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Monthly Excel
          </button>
          {!isLakhBox && (
            <>
              <button
                onClick={exportMemberCSV}
                className="text-sm px-4 py-2 rounded-full border border-border text-foreground hover:bg-muted flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Member CSV
              </button>
              <button
                onClick={exportMemberExcel}
                className="text-sm px-4 py-2 rounded-full border border-border text-foreground hover:bg-muted flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Member Excel
              </button>
            </>
          )}
        </div>
      </div>

      <GroupSelector
        groups={filteredGroups}
        selectedGroupId={selectedGroupId}
        setSelectedGroupId={setSelectedGroupId}
      />

      {isLakhBox ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <SummaryCard icon={Banknote} label="Total Paid / Member" value={fmt(result.totals.totalPaid)} />
            <SummaryCard icon={Building2} label="Company Income (Month 1)" value={fmt(result.totals.totalCompanyIncome)} color="text-foreground" />
            <SummaryCard
              icon={DollarSign}
              label="Net Member Profit / Loss"
              value={fmt(result.totals.totalMemberProfitLoss)}
              color={result.totals.totalMemberProfitLoss >= 0 ? "text-emerald-400" : "text-rose-400"}
            />
          </div>

          <LakhBoxMonthlyTable rows={monthlySummary} fmt={fmt} plan={plan} />
        </>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <SummaryCard icon={Banknote} label="Total Collections" value={fmt(result.totals.totalCollections)} />
            <SummaryCard icon={Building2} label="Company Revenue" value={fmt(result.totals.companyRevenue)} color="text-foreground" />
            <SummaryCard icon={Users} label="Total Dividends" value={fmt(result.totals.totalDividendPool)} color="text-primary" />
            <SummaryCard icon={Trophy} label="Total Prize Payout" value={fmt(result.totals.totalWinningBids)} color="text-emerald-400" />
            <SummaryCard icon={DollarSign} label="Net Balance" value={fmt(result.totals.netBalance)} color={result.totals.netBalance === 0 ? "text-emerald-400" : "text-rose-400"} />
          </div>

          {/* Validation */}
          <ValidationBanner validation={result.validation} fmt={fmt} />

          {/* Tabs */}
          <Tabs defaultValue="monthly" className="w-full">
            <TabsList className="bg-slate-100">
              <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
              <TabsTrigger value="members">Member Ledger</TabsTrigger>
            </TabsList>

            <TabsContent value="monthly">
              <MonthlySummaryTable rows={monthlySummary} fmt={fmt} plan={plan} group={group} />
            </TabsContent>

            <TabsContent value="members">
              <MemberLedgerTable rows={result.memberLedger} fmt={fmt} plan={plan} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

/* ---------- Group Selector ---------- */
function GroupSelector({ groups, selectedGroupId, setSelectedGroupId }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
      <span className="text-sm font-medium text-muted-foreground">Group:</span>
      <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
        <SelectTrigger className="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.group_name || g.group_code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ---------- Validation Banner ---------- */
function ValidationBanner({ validation, fmt }) {
  const allOk =
    validation.collectionsOk &&
    validation.commissionOk &&
    validation.dividendsMatch &&
    validation.balanced &&
    validation.memberAnomalies.length === 0;

  return (
    <div
      className={`rounded-2xl border p-5 ${
        allOk
          ? "bg-emerald-500/10 border-emerald-500/20"
          : "bg-rose-500/10 border-rose-500/20"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        {allOk ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-rose-400" />
        )}
        <h3 className={`text-sm font-semibold ${allOk ? "text-emerald-400" : "text-red-700"}`}>
          {allOk ? "All Accounting Equations Validated" : "Validation Errors Detected"}
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <ValidationItem
          label="Total Collections"
          expected={fmt(validation.collectionsExpected)}
          actual={fmt(validation.collectionsActual)}
          ok={validation.collectionsOk}
        />
        <ValidationItem
          label="Company Commission"
          expected={fmt(validation.commissionExpected)}
          actual={fmt(validation.commissionActual)}
          ok={validation.commissionOk}
        />
        <ValidationItem
          label="Dividend Distribution"
          expected={fmt(validation.dividendsPoolTotal)}
          actual={fmt(validation.dividendsMemberTotal)}
          ok={validation.dividendsMatch}
          variance={validation.dividendsVariance}
        />
      </div>
      <div className="mt-3 pt-3 border-t border-border/60 flex flex-col gap-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            Accounting Equation: Collections ({fmt(validation.collectionsExpected)}) = Winner Payouts + Commission ({fmt(validation.totalPayouts)})
          </span>
          {validation.balanced ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          )}
        </div>
        {!validation.balanced && (
          <span className="text-amber-600">
            Balance variance: {fmt(validation.balanceVariance)} — dividends are netted from collections via reduced payments.
          </span>
        )}
        {validation.roundingVariance !== 0 && (
          <span className="text-muted-foreground">
            Rounding adjustment in dividend distribution: {fmt(validation.roundingVariance)}
          </span>
        )}
      </div>
      {validation.memberAnomalies.length > 0 && (
        <p className="mt-2 text-xs text-rose-400">
          {validation.memberAnomalies.length} member(s) have mathematically impossible net payments.
        </p>
      )}
    </div>
  );
}

function ValidationItem({ label, expected, actual, ok, variance }) {
  return (
    <div className="flex items-center justify-between bg-card/60 rounded-lg px-3 py-2">
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</p>
        <p className="text-slate-700 font-medium">Expected: {expected}</p>
        <p className="text-muted-foreground">Actual: {actual}</p>
      </div>
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
      )}
    </div>
  );
}

/* ---------- Monthly Summary Table ---------- */
function MonthlySummaryTable({ rows, fmt, plan, group }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-medium text-foreground">
          {rows.length}-Month Auction Summary
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {plan.plan_name} · {plan.member_count} members · {plan.commission_percent}% fixed commission
          {group?.monthly_collection_date ? ` · Collection day ${group.monthly_collection_date}` : ""}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Month</th>
              <th className="text-right px-4 py-3">Monthly Payment</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Total Collection</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Commission</th>
              <th className="text-right px-4 py-3">Winner Amount</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Discount</th>
              <th className="text-right px-4 py-3">Dividend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.month}
                className={row.isLastMonth ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"}
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  {row.month}
                  {(row.isFirstMonth || row.isLastMonth) && (
                    <span className="text-amber-500 ml-1">*</span>
                  )}
                  {row.collectionDate && (
                    <span className="block text-[10px] text-muted-foreground font-normal">{row.collectionDate}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                  {fmt(row.monthlyPayment)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{fmt(row.collectionAmount)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{fmt(row.commission)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-400">{fmt(row.winningBid)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{fmt(row.discount)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-primary">{fmt(row.dividendPerMember)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/70 font-medium border-t-2 border-border">
            <tr>
              <td className="px-4 py-3 text-muted-foreground">Total ({rows.length} months)</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {fmt(rows.reduce((s, r) => s + r.monthlyPayment, 0))}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                {fmt(rows.reduce((s, r) => s + r.collectionAmount, 0))}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                {fmt(rows.reduce((s, r) => s + r.commission, 0))}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-emerald-400">
                {fmt(rows.reduce((s, r) => s + r.winningBid, 0))}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                {fmt(rows.reduce((s, r) => s + r.discount, 0))}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
        * First &amp; last month: winner receives full chit amount minus commission (no discount).
        All members pay every month; dividends reduce everyone's payment equally.
      </div>
    </div>
  );
}

/* ---------- LakhBox Monthly Table ---------- */
function LakhBoxMonthlyTable({ rows, fmt, plan }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-medium text-foreground">{rows.length}-Month CashBox Rotation Summary</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {plan.plan_name} · {plan.member_count} members · fixed monthly payment, no dividends
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Month</th>
              <th className="text-left px-4 py-3">Winner</th>
              <th className="text-right px-4 py-3">Winner Payout</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Monthly Payment</th>
              <th className="text-right px-4 py-3">Premium / Bonus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.month} className={row.isCompanyMonth ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"}>
                <td className="px-4 py-3 font-medium text-foreground">{row.month}</td>
                <td className="px-4 py-3 text-foreground">{row.winnerLabel}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-400">{fmt(row.winnerPayout)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{fmt(row.memberMonthlyPayment)}</td>
                <td className={`px-4 py-3 text-right tabular-nums font-medium ${row.profitLoss >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {row.profitLoss >= 0 ? "+" : ""}{fmt(row.profitLoss)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
        Month 1: company keeps that month's collection as income. Every member pays the same monthly amount for the
        full duration regardless of when they win.
      </div>
    </div>
  );
}

/* ---------- Member Ledger Table ---------- */
function MemberLedgerTable({ rows, fmt, plan }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-medium text-foreground">Individual Member Ledger</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Gross Installments = {fmt(plan.monthly_contribution)} × {plan.duration_months} months. Net = Gross − Dividends − Prize.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Member</th>
              <th className="text-right px-4 py-3">Prize Month</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Gross Installments</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Total Dividends</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Net Installments</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Prize Amount</th>
              <th className="text-right px-4 py-3">Net Position</th>
              <th className="text-center px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((m) => (
              <tr key={m.memberNum} className="hover:bg-muted/50">
                <td className="px-4 py-3 font-medium text-foreground">Member #{m.memberNum}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  Month {m.prizeMonth}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{fmt(m.totalInstallments)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-primary hidden sm:table-cell">{fmt(m.totalDividends)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{fmt(m.netInstallments)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-400 hidden sm:table-cell">{fmt(m.prizeAmount)}</td>
                <td className={`px-4 py-3 text-right tabular-nums font-medium ${m.netAmountPaid < 0 ? "text-blue-400" : "text-slate-700"}`}>
                  {fmt(m.netAmountPaid)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-400">
                    {m.prizeStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/70 font-medium border-t-2 border-border">
            <tr>
              <td className="px-4 py-3 text-muted-foreground" colSpan={2}>Total ({rows.length} members)</td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                {fmt(rows.reduce((s, m) => s + m.totalInstallments, 0))}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-primary hidden sm:table-cell">
                {fmt(rows.reduce((s, m) => s + m.totalDividends, 0))}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                {fmt(rows.reduce((s, m) => s + m.netInstallments, 0))}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-emerald-400 hidden sm:table-cell">
                {fmt(rows.reduce((s, m) => s + m.prizeAmount, 0))}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                {fmt(rows.reduce((s, m) => s + m.netAmountPaid, 0))}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
        Gross Installments = monthly contribution × duration. Net Installments = Gross − Dividends.
        Net Position = Net Installments − Prize. Negative (blue) = member received more than paid — expected for early winners.
      </div>
    </div>
  );
}

/* ---------- Summary Card ---------- */
function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground/60" />
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <p className={`text-xl font-semibold ${color || "text-foreground"}`}>{value}</p>
    </div>
  );
}