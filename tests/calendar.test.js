import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDays, dateKey, normalizeName } from '../docs/calendar.js';

test('calendario empieza en lunes y cubre los cambios de año', () => {
  const days = monthDays(2026, 10);
  assert.equal(days.length, 42);
  assert.equal(days[0].key, '2026-10-26');
  assert.equal(days[6].key, '2026-11-01');
  assert.equal(monthDays(2027, 0)[0].key, '2026-12-28');
  assert.equal(new Set(days.map(day => day.key)).size, 42);
});
test('incluye 29 de febrero solo en años bisiestos', () => {
  assert.ok(monthDays(2028, 1).some(day => day.key === '2028-02-29' && !day.outside));
  assert.equal(monthDays(2027, 1).filter(day => !day.outside).length, 28);
});
test('las fechas usan el día local y los nombres ignoran espacios y mayúsculas', () => {
  assert.equal(dateKey(new Date(2026, 0, 1, 0)), '2026-01-01');
  assert.equal(normalizeName('  María   Pérez  '), 'maría pérez');
});
