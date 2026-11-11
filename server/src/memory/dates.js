import * as chrono from 'chrono-node';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

const MONTH_PATTERN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

/**
 * Dates are resolved here, not by the model.
 * "Last Tuesday" means the most recent Tuesday before today. The Tuesday
 * before that is kept as a fallback and used only when the recent day has
 * no conversation. Explicit dates such as "3 November" use chrono, with a
 * local month-day parser behind it.
 */
export function resolveDates(text, now = new Date(), timeZone = 'Asia/Kolkata') {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const today = zonedParts(now, timeZone);
  const ranges = [];
  const seen = new Set();

  const add = (ymd, kind) => {
    if (!ymd || !validYmd(ymd.year, ymd.month, ymd.day)) return;
    const key = dayKey(ymd);
    if (seen.has(key)) return;
    seen.add(key);
    const bounds = dayBounds(ymd, timeZone);
    const range = { ...bounds, ymd, label: formatDay(ymd), kind, fallback: null };
    if (kind === 'weekday') {
      const prev = addDays(ymd, -7);
      range.fallback = { ...dayBounds(prev, timeZone), ymd: prev, label: formatDay(prev), kind: 'weekday-fallback' };
    }
    ranges.push(range);
  };

  if (/\btoday\b/i.test(lower)) add(ymdFromParts(today), 'today');
  if (/\byesterday\b/i.test(lower)) add(addDays(ymdFromParts(today), -1), 'yesterday');

  const weekdayRe = /\b(?:(last|this|on|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi;
  for (const match of source.matchAll(weekdayRe)) {
    if ((match[1] || '').toLowerCase() === 'next') continue;
    const index = WEEKDAYS.indexOf(match[2].toLowerCase());
    add(mostRecentWeekday(ymdFromParts(today), index), 'weekday');
  }

  for (const ymd of explicitDates(source, today)) add(ymd, 'explicit');

  const since = /\b(since then|since that|after that|changed since|since|still correct|still true|still right|still accurate)\b/i.test(lower);
  const followUp = /\b(any of them|those|since then|since that|still correct|still true|still right|still accurate|what about now)\b/i.test(lower);

  return { ranges, since, followUp, timeZone };
}

export function dayKey(ymd) {
  const month = String(ymd.month).padStart(2, '0');
  const day = String(ymd.day).padStart(2, '0');
  return `${ymd.year}-${month}-${day}`;
}

export function formatDay(ymd) {
  const date = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatWhen(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function dayBounds(ymd, timeZone) {
  const from = zonedDateTimeToUtc(ymd.year, ymd.month, ymd.day, 0, 0, 0, timeZone);
  const next = addDays(ymd, 1);
  const to = zonedDateTimeToUtc(next.year, next.month, next.day, 0, 0, 0, timeZone);
  return { from, to };
}

function explicitDates(text, today) {
  const found = [];
  const dayMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`, 'gi');
  const monthDay = new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?(?:\\s+(\\d{4}))?\\b`, 'gi');
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

  for (const match of text.matchAll(dayMonth)) {
    found.push(resolveYear(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1]), today));
  }
  for (const match of text.matchAll(monthDay)) {
    found.push(resolveYear(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2]), today));
  }
  for (const match of text.matchAll(iso)) {
    found.push({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) });
  }

  const hidden = text
    .replace(dayMonth, ' ')
    .replace(monthDay, ' ')
    .replace(/\b(?:last|this|on|next)\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, ' ')
    .replace(/\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, ' ')
    .replace(/\b(today|yesterday)\b/gi, ' ');

  for (const ymd of chronoDates(hidden, today)) found.push(ymd);
  return found.filter(Boolean);
}

function chronoDates(text, today) {
  const parser = chrono.strict || chrono.default?.strict;
  if (!parser?.parse) return [];
  const ref = new Date(Date.UTC(today.year, today.month - 1, today.day, 12));
  let results = [];
  try {
    results = parser.parse(text, ref, { forwardDate: false });
  } catch {
    return [];
  }
  return results.map((result) => {
    if (!result.start?.isCertain?.('day') || !result.start.isCertain('month')) return null;
    const month = result.start.get('month');
    const day = result.start.get('day');
    const year = result.start.isCertain('year') ? result.start.get('year') : null;
    return resolveYear(year, month, day, today);
  }).filter(Boolean);
}

function resolveYear(year, month, day, today) {
  if (!month || !day) return null;
  let y = year;
  if (!y) {
    y = today.year;
    if (compareYmd({ year: y, month, day }, today) > 0) y -= 1;
  }
  const ymd = { year: y, month, day };
  return validYmd(y, month, day) ? ymd : null;
}

function mostRecentWeekday(today, target) {
  const current = weekdayIndex(today);
  let delta = (current - target + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(today, -delta);
}

function weekdayIndex(ymd) {
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
}

function ymdFromParts(parts) {
  return { year: parts.year, month: parts.month, day: parts.day };
}

function compareYmd(a, b) {
  return dayKey(a).localeCompare(dayKey(b));
}

export function addDays(ymd, delta) {
  const date = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  date.setUTCDate(date.getUTCDate() + delta);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function validYmd(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function zonedDateTimeToUtc(year, month, day, hour, minute, second, timeZone) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i += 1) {
    const parts = zonedParts(new Date(utc), timeZone);
    const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
    const delta = wanted - shown;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}
