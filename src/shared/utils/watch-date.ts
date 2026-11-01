const pad2 = (value: number) => value.toString().padStart(2, "0");

/** A `<input type="date">` value for `date`, in the local calendar. */
export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * The `watchedAt` a picked day stands for: right now when it's today (the
 * usual "I just watched it"), otherwise midday local time — a day in the
 * past with no meaningful hour, kept clear of either midnight so no time
 * zone shifts it onto the neighbouring date.
 */
export function watchedAtForDay(day: string, now: Date = new Date()): string {
  if (day === toDateInputValue(now)) return now.toISOString();
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, date ?? 1, 12).toISOString();
}
