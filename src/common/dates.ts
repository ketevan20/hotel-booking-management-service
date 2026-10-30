import { BadRequestException } from '@nestjs/common';

// 'YYYY-MM-DD' -> that day at 00:00 UTC (nights are stored as date-only values)
export function parseDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('Dates must look like 2026-11-10');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Invalid date');
  }
  return date;
}

// Nights from `from` up to, but not including, `to` (like check-in and check-out)
export function eachNight(from: Date, to: Date): Date[] {
  const nights: Date[] = [];
  for (let d = from.getTime(); d < to.getTime(); d += 24 * 60 * 60 * 1000) {
    nights.push(new Date(d));
  }
  return nights;
}

// "Today" depends on the hotel's own timezone
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const addDays = (day: Date, days: number) =>
  new Date(day.getTime() + days * 24 * 60 * 60 * 1000);

// from is included, to is not. Weeks start on Monday
export function rangeFor(range: 'today' | 'week' | 'month', todayStr: string) {
  const today = parseDay(todayStr);
  if (range === 'today') return { from: today, to: addDays(today, 1) };
  if (range === 'week') {
    const offset = (today.getUTCDay() + 6) % 7; // Monday = 0
    const from = addDays(today, -offset);
    return { from, to: addDays(from, 7) };
  }
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 1)) };
}

// The calendar day (YYYY-MM-DD) of a moment, in the hotel's timezone
export function dayIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}