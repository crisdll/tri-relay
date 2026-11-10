import test from 'node:test';
import assert from 'node:assert/strict';
import { listMonthKeys, groupListEvents, validListDate } from '../docs/event-list.js';

test('la llista cobreix dotze mesos i creua correctament el canvi d’any', () => {
  const keys = listMonthKeys(new Date(2026, 10, 1, 12));
  assert.equal(keys.length, 12); assert.equal(keys[0], '2026-11'); assert.equal(keys[11], '2027-10');
  assert.equal(new Set(keys).size, 12);
});
test('ordena per data i agrupa modalitats del mateix esdeveniment sense barrejar participants', () => {
  const events = [
    { id: 'sprint', date: '2027-07-11', name: 'Altriman', distance: 'Sprint', participants: [{ name: 'Àlex' }] },
    { id: 'olympic', date: '2027-07-11', name: ' ALTRIMAN ', distance: 'Olímpica', participants: [{ name: 'Moi' }] },
    { id: 'half', date: '2027-07-10', name: 'Altriman', distance: 'Half', participants: [{ name: 'Edu' }] },
    { id: 'other', date: '2027-07-11', name: 'Una altra cursa', distance: '', participants: [] }
  ];
  const groups = groupListEvents(events);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].date, '2027-07-10');
  assert.equal(groups[1].variants.length, 2);
  assert.deepEqual(groups[1].variants.map(event => event.participants[0].name), ['Àlex', 'Moi']);
  assert.equal(events.length, 4);
});
test('una mateixa entrada rebuda dos cops només es mostra una vegada', () => {
  const event = { id: 'one', date: '2027-01-01', name: 'Cursa', participants: [] };
  assert.equal(groupListEvents([event, event])[0].variants.length, 1);
});
test('rebutja dates impossibles abans de passar al formulari de creació', () => {
  for (const date of ['', '2027-02-29', '2027-04-31', '1999-12-31', '2101-01-01', '2027-7-1']) assert.equal(validListDate(date), false, date);
  for (const date of ['2028-02-29', '2027-07-11', '2000-01-01', '2100-12-31']) assert.equal(validListDate(date), true, date);
});
