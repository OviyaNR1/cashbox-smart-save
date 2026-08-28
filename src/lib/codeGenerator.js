import { base44 } from "@/api/base44Client";

/**
 * Auto-generates a member code: CB-M0001, CB-M0002, etc. Derived from the
 * highest existing code number, not a row count — a count drifts out of
 * sync (and starts colliding with still-in-use codes) the moment any
 * profile is deleted, since numbering isn't necessarily dense.
 */
export async function generateMemberCode() {
  const existing = await base44.entities.MemberProfile.list("-created_date", 1000);
  const maxNum = existing.reduce((max, m) => {
    const match = /^CB-M(\d+)$/.exec(m.member_code || "");
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `CB-M${String(maxNum + 1).padStart(4, "0")}`;
}

/**
 * Auto-generates a group code based on currency:
 * CB_CA_YYYY_XX (Canada) or CB_IN_YYYY_XX (India)
 * where XX is a 2-digit sequence for that year+region.
 */
export async function generateGroupCode(currency = "INR") {
  const year = new Date().getFullYear();
  const region = currency === "CAD" ? "CA" : "IN";
  const prefix = `CB_${region}_${year}_`;

  const existing = await base44.entities.ChitGroup.list("-created_date", 500);
  const maxNum = existing.reduce((max, g) => {
    if (!g.group_code || !g.group_code.startsWith(prefix)) return max;
    const n = parseInt(g.group_code.slice(prefix.length), 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `${prefix}${String(maxNum + 1).padStart(2, "0")}`;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

// "1 Lakh" / "5 Lakh" reads naturally for round-lakh INR amounts (the norm
// for this app's plans); anything else falls back to a plain amount so it
// never prints something nonsensical like "1.5 Lakh" or "0 Lakh".
function formatAmountLabel(amount, currency) {
  const n = Number(amount) || 0;
  if (currency === "CAD") return `$${n.toLocaleString("en-US")}`;
  if (n >= 100000 && n % 100000 === 0) return `${n / 100000} Lakh`;
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

/**
 * Auto-generates a group name from the plan's amount + the group's start
 * month, e.g. "1 Lakh Group Sept #2" — deliberately excludes branch, since
 * members join a group from all over rather than one location, so tying the
 * name to a branch would be misleading. The trailing "#N" is a per-plan
 * sequence number (existing groups on the same plan, +1) so two groups on
 * the same plan starting in the same month still get distinct names.
 * `excludeGroupId` lets an edit re-generate the name without counting the
 * group being edited as one of the "existing" groups on its own plan.
 */
export async function generateGroupName(plan, startDate, excludeGroupId) {
  const amountLabel = formatAmountLabel(plan?.chit_amount, plan?.currency);
  // Read the month straight out of the "YYYY-MM-DD" string rather than
  // through `new Date(startDate).getMonth()` — that parses as UTC midnight
  // but reads back in the viewer's local time, which can shift the result
  // to the wrong month depending on timezone (see dates.js for the same
  // bug class already found and fixed elsewhere in this app).
  const month = MONTH_ABBR[startDate ? Number(startDate.slice(5, 7)) - 1 : new Date().getMonth()];
  const existing = await base44.entities.ChitGroup.list("-created_date", 500);
  const count = existing.filter((g) => g.plan_id === plan?.id && g.id !== excludeGroupId).length;
  return `${amountLabel} Group ${month} #${count + 1}`;
}