import test from 'node:test';
import assert from 'node:assert/strict';
import { MonthStore } from '../docs/month-store.js';

const event = (id, month, participants = []) => ({ id, date: `${month}-14`, name: 'Triatló', participants });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('conserva les dades immediatament mentre una actualització lenta està pendent', async () => {
  let pending = null;
  const store = new MonthStore({ fetchMonth: () => pending ? pending.promise : [event('old', '2027-01')] });
  await store.refresh('2027-01');
  pending = deferred();
  const reading = store.refresh('2027-01');
  assert.equal(store.peek('2027-01').events[0].id, 'old');
  pending.resolve([event('new', '2027-01')]);
  await reading;
  assert.equal(store.peek('2027-01').events[0].id, 'new');
});

test('reutilitza la precàrrega quan es navega al mateix mes i limita les consultes simultànies', async () => {
  const requests = new Map(), called = [];
  const store = new MonthStore({ concurrency: 2, fetchMonth: key => {
    called.push(key); const request = deferred(); requests.set(key, request); return request.promise;
  } });
  const first = store.refresh('2027-01');
  const second = store.refresh('2027-02');
  const third = store.refresh('2027-03');
  const duplicate = store.refresh('2027-02', { priority: true });
  assert.equal(duplicate, second);
  await tick(); assert.deepEqual(called, ['2027-01', '2027-02']);
  requests.get('2027-02').resolve([]); await second; await tick();
  assert.deepEqual(called, ['2027-01', '2027-02', '2027-03']);
  requests.get('2027-01').resolve([]); requests.get('2027-03').resolve([]);
  await Promise.all([first, third]);
});

test('una resposta tardana d’un mes no substitueix les dades d’un altre', async () => {
  const january = deferred(), february = deferred();
  const store = new MonthStore({ fetchMonth: key => key === '2027-01' ? january.promise : february.promise });
  const one = store.refresh('2027-01'), two = store.refresh('2027-02');
  february.resolve([event('february', '2027-02')]); await two;
  january.resolve([event('january', '2027-01')]); await one;
  assert.equal(store.peek('2027-02').events[0].id, 'february');
  assert.equal(store.peek('2027-01').events[0].id, 'january');
});

test('un refresh antic no esborra una inscripció o un esdeveniment acabat de desar', async () => {
  const reading = deferred();
  const store = new MonthStore({ fetchMonth: () => reading.promise });
  store.upsert(event('one', '2027-01'));
  const pending = store.refresh('2027-01'); await tick();
  store.upsert(event('one', '2027-01', [{ name: 'Cris' }]));
  store.upsert(event('two', '2027-01'));
  reading.resolve([event('one', '2027-01')]);
  const result = await pending;
  assert.equal(result.events.length, 2);
  assert.deepEqual(result.events[0].participants, [{ name: 'Cris' }]);
});

test('reobrir recupera els punts guardats i permet consultar dades noves igualment', async () => {
  let saved = '', now = 1000, calls = 0;
  const storage = { getItem: () => saved, setItem: (_, text) => { saved = text; } };
  const original = new MonthStore({ storage, now: () => now, fetchMonth: () => [event('one', '2027-01')] });
  await original.refresh('2027-01');
  const reopened = new MonthStore({ storage, now: () => now, fetchMonth: () => { calls++; return []; } });
  assert.equal(reopened.peek('2027-01').events.length, 1);
  await reopened.refresh('2027-01'); assert.equal(calls, 1);
  assert.deepEqual(reopened.peek('2027-01').events, []);
  now += 61000;
  assert.equal(reopened.isFresh('2027-01'), false);
});

test('un error conserva els punts guardats i permet tornar-ho a provar', async () => {
  let fail = false;
  const store = new MonthStore({ fetchMonth: () => {
    if (fail) throw new Error('offline'); return [event('one', '2027-01')];
  } });
  await store.refresh('2027-01'); fail = true;
  await assert.rejects(store.refresh('2027-01'), /offline/);
  assert.equal(store.peek('2027-01').events.length, 1);
  fail = false; await store.refresh('2027-01');
});

test('la memòria cau no impedeix el funcionament si el navegador bloqueja localStorage', async () => {
  const storage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const store = new MonthStore({ storage, fetchMonth: () => [] });
  await store.refresh('2027-01'); assert.deepEqual(store.peek('2027-01').events, []);
});

test('prioritza el mes seleccionat davant les precàrregues en espera', async () => {
  const requests = new Map(), order = [];
  const store = new MonthStore({ concurrency: 1, fetchMonth: key => {
    order.push(key); const request = deferred(); requests.set(key, request); return request.promise;
  } });
  const one = store.refresh('2027-01'), two = store.refresh('2027-02'), three = store.refresh('2027-03');
  store.refresh('2027-03', { priority: true });
  await tick(); requests.get('2027-01').resolve([]); await one; await tick();
  assert.deepEqual(order, ['2027-01', '2027-03']);
  requests.get('2027-03').resolve([]); await three; await tick();
  requests.get('2027-02').resolve([]); await two;
});

test('la comprovació fresca abans de crear preval sobre una precàrrega antiga', async () => {
  const stale = deferred();
  const store = new MonthStore({ fetchMonth: () => stale.promise });
  const reading = store.refresh('2027-01'); await tick();
  store.replace('2027-01', [event('created-by-someone-else', '2027-01')]);
  stale.resolve([]); await reading;
  assert.equal(store.peek('2027-01').events[0].id, 'created-by-someone-else');
});
