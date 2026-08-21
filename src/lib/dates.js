// Date-only strings (YYYY-MM-DD) from the database get parsed by
// `new Date(str)` as UTC midnight, but `.getMonth()`/`.setDate()`/
// `.setMonth()` read and write in the *viewer's local* timezone. Doing
// month/day arithmetic through those local getters on a UTC-midnight value
// silently shifts the result by a day (sometimes more) depending on the
// viewer's timezone offset — e.g. "2026-09-01" turning into "2026-08-02"
// for a viewer west of UTC. Every helper here works entirely in UTC space
// to avoid that class of bug.

// Adds `months` calendar months to a date string, keeping the same
// day-of-month (with JS's normal month-length rollover).
export function addMonthsUTC(dateStr, months) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

// Adds `months` calendar months to a date string, but clamps the result to
// a specific day-of-month (e.g. a group's monthly_collection_date) instead
// of keeping the start date's own day. Clamped to 28 so it's always valid
// regardless of which month it lands in.
export function collectionDateUTC(startDateStr, months, day) {
  if (!startDateStr) return null;
  const [y, m] = startDateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, Math.min(day || 1, 28))).toISOString().slice(0, 10);
}
