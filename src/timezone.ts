const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = FORMATTER_CACHE.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
    FORMATTER_CACHE.set(timeZone, formatter)
  }
  return formatter
}

function partsAt(utcMs: number, timeZone: string): Record<string, number> {
  const parts = getFormatter(timeZone).formatToParts(new Date(utcMs))
  const out: Record<string, number> = {}
  for (const p of parts) {
    if (p.type !== "literal") {
      out[p.type] = Number(p.value)
    }
  }
  return out
}

function tzOffsetMinutes(utcMs: number, timeZone: string): number {
  const p = partsAt(utcMs, timeZone)
  const localMs = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour === 24 ? 0 : p.hour,
    p.minute,
    p.second
  )
  return (localMs - utcMs) / 60000
}

// Returns the UTC instant whose wall-clock time in `timeZone` is the given
// (year, month0, day, hour, minute, second). Two-pass to handle DST: the
// initial guess (treating components as UTC) may land on the opposite side of
// a DST transition from the corrected instant, so we re-check the offset.
export function instantFromTzWallClock(
  year: number,
  month0: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  let utc = Date.UTC(year, month0, day, hour, minute, second)
  const offset1 = tzOffsetMinutes(utc, timeZone)
  utc -= offset1 * 60000
  const offset2 = tzOffsetMinutes(utc, timeZone)
  if (offset2 !== offset1) {
    utc -= (offset2 - offset1) * 60000
  }
  return new Date(utc)
}
