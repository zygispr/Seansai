/**
 * Calendar and clock helpers for Europe/Vilnius. All instants are stored in UTC; every calendar
 * date the product shows is the date in Vilnius (FR-016), so a screening starting after midnight
 * belongs to the date it starts on.
 */

export const TIME_ZONE = 'Europe/Vilnius';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function localPartsOf(instant: Date): LocalParts {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

/** Offset of Vilnius local time from UTC at the given instant, in milliseconds. */
function offsetAt(instant: Date): number {
  const local = localPartsOf(instant);
  const localAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  const wholeSeconds = instant.getTime() - instant.getUTCMilliseconds();
  return localAsUtc - wholeSeconds;
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

/** Calendar date (`YYYY-MM-DD`) of the instant in Vilnius. */
export function localDateOf(instant: Date): string {
  const { year, month, day } = localPartsOf(instant);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Today's calendar date in Vilnius. */
export function todayIn(now: Date): string {
  return localDateOf(now);
}

/**
 * The instant at which the given Vilnius wall-clock time occurs. During the autumn DST change,
 * when 03:00–04:00 happens twice, the earlier occurrence is returned.
 */
export function instantFromLocal(date: string, time: string): Date {
  const [, yearText, monthText, dayText] = DATE_PATTERN.exec(date) ?? [];
  const [, hourText, minuteText, secondText] = TIME_PATTERN.exec(time) ?? [];
  if (yearText === undefined || hourText === undefined) {
    throw new RangeError(`Invalid local date/time: "${date} ${time}"`);
  }
  const [year, month, day] = [Number(yearText), Number(monthText), Number(dayText)];
  const [hour, minute, second] = [Number(hourText), Number(minuteText), Number(secondText ?? 0)];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    throw new RangeError(`Invalid local date/time: "${date} ${time}"`);
  }

  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Guess with the offset in effect a day earlier so that the earlier of two ambiguous
  // instants wins, then correct once if the offset changed in between.
  const firstGuess = wallClockAsUtc - offsetAt(new Date(wallClockAsUtc - MS_PER_DAY));
  const correctedOffset = offsetAt(new Date(firstGuess));
  return new Date(wallClockAsUtc - correctedOffset);
}

/** Adds whole calendar days to a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Invalid date: "${date}"`);
  const [year, month, day] = match.slice(1, 4).map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** ISO 8601 with the Vilnius offset, e.g. `2026-10-30T21:35:00+02:00` (public API format). */
export function formatInstant(instant: Date): string {
  const local = localPartsOf(instant);
  const offsetMinutes = Math.round(offsetAt(instant) / 60_000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return (
    `${pad(local.year, 4)}-${pad(local.month)}-${pad(local.day)}` +
    `T${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}
