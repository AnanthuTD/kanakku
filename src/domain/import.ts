export const IMPORT_PERIODS = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 4, label: "4 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 0, label: "All history" },
] as const;

export function importSince(months: number, now = new Date()): Date | null {
  if (!IMPORT_PERIODS.some((p) => p.months === months))
    throw new Error("Unsupported import period");
  if (months === 0) return null;
  const date = new Date(now);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() - months);
  const lastDay = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
}
export function importRange(months: number, now = new Date()) {
  const since = importSince(months, now);
  const format = (date: Date) =>
    date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return since
    ? `${format(since)} – ${format(now)}`
    : `All available messages through ${format(now)}`;
}
