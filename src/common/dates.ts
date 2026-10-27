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