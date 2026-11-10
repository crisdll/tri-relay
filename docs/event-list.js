import { dateKey, normalizeName } from './calendar.js';

export function listMonthKeys(start, count = 12) {
  return Array.from({ length: count }, (_, index) => dateKey(new Date(start.getFullYear(), start.getMonth() + index, 1, 12)).slice(0, 7));
}

export function groupListEvents(events) {
  const groups = new Map(), seen = new Set();
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const key = JSON.stringify([event.date, normalizeName(event.name)]);
    if (!groups.has(key)) groups.set(key, { date: event.date, name: event.name, variants: [] });
    groups.get(key).variants.push(event);
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ca'));
}

export function validListDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2100-12-31') return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value;
}
