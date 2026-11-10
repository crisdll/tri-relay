import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../docs/event-store.js';

const event = (id, date, participants = []) => ({ id, date, name: id, participants });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('les dues vistes i qualsevol mes comparteixen una sola consulta', async () => {
  let requests = 0; const waiting = deferred();
  const store = new EventStore({ fetchEvents: from => { requests++; assert.equal(from, '2026-11-10'); return waiting.promise; } });
  const calendar = store.refresh('2026-11-10'), list = store.refresh('2026-11-10');
  assert.equal(calendar, list); await tick(); assert.equal(requests, 1);
  waiting.resolve([event('today', '2026-11-10'), event('far', '2030-01-01')]); await calendar;
  for (let index = 0; index < 36; index++) assert.equal(store.peek('2026-11-10').events.length, 2);
  assert.equal(requests, 1);
});

test('reobrir mostra les dades guardades i exclou les que ja han passat', async () => {
  let saved = '';
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const first = new EventStore({ storage, fetchEvents: () => [event('one', '2026-11-10'), event('two', '2026-11-11')] });
  await first.refresh('2026-11-10');
  const reopened = new EventStore({ storage, fetchEvents: () => [] });
  assert.deepEqual(reopened.peek('2026-11-11').events.map(event => event.id), ['two']);
  await reopened.refresh('2026-11-11'); assert.deepEqual(reopened.peek('2026-11-11').events, []);
});

test('una resposta tardana no esborra una inscripció acabada de desar', async () => {
  const waiting = deferred(); const store = new EventStore({ fetchEvents: () => waiting.promise });
  store.replace([event('one', '2026-11-14')], '2026-11-10');
  const reading = store.refresh('2026-11-10'); await tick();
  store.upsert(event('one', '2026-11-14', [{ name: 'Cris' }]), '2026-11-10');
  waiting.resolve([event('one', '2026-11-14'), event('other', '2028-01-01')]); await reading;
  assert.equal(store.peek('2026-11-10').events.length, 2);
  assert.deepEqual(store.peek('2026-11-10').events[0].participants, [{ name: 'Cris' }]);
});

test('la comprovació de duplicats preval sobre lectures anteriors i els errors conserven les dades', async () => {
  const waiting = deferred(); let fail = false;
  const store = new EventStore({ fetchEvents: () => { if (fail) throw new Error('offline'); return waiting.promise; } });
  const reading = store.refresh('2026-11-10'); await tick();
  store.replace([event('new', '2026-11-14')], '2026-11-10'); waiting.resolve([]); await reading;
  assert.equal(store.peek('2026-11-10').events[0].id, 'new');
  fail = true; await assert.rejects(store.refresh('2026-11-10'), /offline/);
  assert.equal(store.peek('2026-11-10').events[0].id, 'new');
  assert.equal(store.pending, null);
});
