import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

function backend() {
  const sheets = new Map(); let locked = false, spreadsheetId = null;
  const book = {
    getSheetByName: name => sheets.get(name),
    insertSheet(name) {
      const data = []; const sheet = {
        data, getLastRow: () => data.length, setFrozenRows() {},
        getRange(row, column, height, width) {
          return {
            getValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => data[row - 1 + i]?.[column - 1 + j] ?? '')),
            setNumberFormat() { return this; },
            setValues(values) { for (let i = 0; i < values.length; i++) { data[row - 1 + i] ??= []; for (let j = 0; j < values[i].length; j++) data[row - 1 + i][column - 1 + j] = values[i][j]; } return this; }
          };
        }
      }; sheets.set(name, sheet); return sheet;
    }
  };
  const context = vm.createContext({ console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => spreadsheetId, setProperty: (_, value) => { spreadsheetId = value; } }) },
    SpreadsheetApp: { openById: id => { assert.equal(id, 'test-sheet'); return book; }, getActiveSpreadsheet: () => ({ getId: () => 'test-sheet' }) }, Utilities: { getUuid: randomUUID },
    LockService: { getScriptLock: () => ({ tryLock() { assert.equal(locked, false); locked = true; return true; }, releaseLock() { locked = false; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) }
  });
  vm.runInContext(fs.readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8'), context);
  context.setup();
  return { call: data => context.doPost({ postData: { contents: JSON.stringify(data) } }), sheets, context };
}
test('dos personas comparten eventos y participantes desde el servidor', () => {
  const { call } = backend();
  const created = call({ action: 'create', date: '2026-11-14', name: 'Triatlón' });
  assert.equal(created.ok, true);
  const id = created.event.id;
  assert.equal(call({ action: 'join', eventId: id, name: 'Cris' }).event.participants.length, 1);
  assert.equal(call({ action: 'join', eventId: id, name: 'Dani' }).event.participants.length, 2);
  const list = call({ action: 'list', month: '2026-11' });
  assert.deepEqual(list.events[0].participants, [{ name: 'Cris' }, { name: 'Dani' }]);
  assert.equal(call({ action: 'list', month: '2026-12' }).events.length, 0);
});
test('reintentos no duplican nombres ni eventos y admite dos planes el mismo día', () => {
  const { call } = backend();
  const one = call({ action: 'create', date: '2026-11-14', name: '  Salida   en bici ' });
  const duplicate = call({ action: 'create', date: '2026-11-14', name: 'salida en BICI' });
  assert.equal(duplicate.event.id, one.event.id); assert.equal(duplicate.existing, true);
  call({ action: 'create', date: '2026-11-14', name: 'Natación' });
  call({ action: 'join', eventId: one.event.id, name: ' María   Pérez ' });
  const retry = call({ action: 'join', eventId: one.event.id, name: 'maría pérez' });
  assert.equal(retry.existing, true); assert.equal(retry.event.participants.length, 1);
  assert.equal(call({ action: 'list', month: '2026-11' }).events.length, 2);
});
test('rechaza fechas imposibles, nombres vacíos y eventos inexistentes', () => {
  const { call } = backend();
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-11-00', '1999-01-01', 'no']) assert.equal(call({ action: 'create', date, name: 'Plan' }).ok, false);
  assert.equal(call({ action: 'create', date: '2028-02-29', name: 'Plan' }).ok, true);
  for (const name of ['   ', 'x'.repeat(101), null]) assert.equal(call({ action: 'create', date: '2026-11-14', name }).ok, false);
  assert.equal(call({ action: 'join', eventId: 'missing', name: 'Cris' }).ok, false);
  assert.equal(call({ action: 'list', month: '2026-13' }).ok, false);
  assert.equal(call({ action: 'erase' }).ok, false);
});
test('nombres con fórmulas se guardan como texto y setup no borra datos', () => {
  const { call, sheets, context } = backend();
  const created = call({ action: 'create', date: '2026-11-14', name: '=SUM(1,2)' });
  assert.equal(created.event.name, '=SUM(1,2)');
  assert.equal(sheets.get('Eventos').data[1][2][0], '"');
  const result = call({ action: 'join', eventId: created.event.id, name: '=IMPORTXML("https://example.com","//a")' });
  assert.equal(result.ok, true); assert.equal(sheets.get('Personas').data[1][1][0], '"');
  context.setup(); assert.equal(call({ action: 'list', month: '2026-11' }).events.length, 1);
});

test('un esdeveniment amb dues modalitats té llistes de participants independents', () => {
  const { call } = backend();
  const create = distance => call({ action: 'create', date: '2026-11-14', name: 'Challenge Barcelona', distance });
  const olympic = create('Olímpica').event;
  const half = create('Half').event;
  assert.notEqual(olympic.id, half.id);
  assert.equal(create('  HALF  ').event.id, half.id);
  assert.equal(create('half').existing, true);
  call({ action: 'join', eventId: olympic.id, name: 'Cris' });
  call({ action: 'join', eventId: half.id, name: 'Marta' });
  const events = call({ action: 'list', month: '2026-11' }).events;
  assert.deepEqual(events.map(event => [event.distance, event.participants.map(person => person.name)]), [['Olímpica', ['Cris']], ['Half', ['Marta']]]);
  assert.equal(create('').event.distance, '');
  assert.equal(call({ action: 'list', month: '2026-11' }).events.length, 3);
  assert.equal(create('x'.repeat(61)).ok, false);
  assert.equal(create({ text: 'Half' }).ok, false);
});

test('actualitzar una fulla antiga conserva esdeveniments i inscripcions', () => {
  const { call, context, sheets } = backend();
  const old = call({ action: 'create', date: '2026-11-14', name: 'Sortida' }).event;
  call({ action: 'join', eventId: old.id, name: 'Cris' });
  sheets.get('Eventos').data.forEach(row => row.pop());
  context.setup();
  const event = call({ action: 'list', month: '2026-11' }).events[0];
  assert.equal(event.distance, '');
  assert.equal(event.id, old.id);
  assert.deepEqual(event.participants, [{ name: 'Cris' }]);
  assert.equal(call({ action: 'create', date: '2026-11-14', name: 'Sortida' }).event.id, old.id);
  const formula = call({ action: 'create', date: '2026-11-14', name: 'Sortida', distance: '=SUM(1,2)' });
  assert.equal(formula.event.distance, '=SUM(1,2)');
  assert.equal(sheets.get('Eventos').data[2][5][0], '"');
});

test('una sola consulta retorna tots els esdeveniments des d’avui, inclosos els de diversos anys després', () => {
  const { call } = backend();
  for (const date of ['2026-11-09', '2026-11-10', '2027-12-01', '2030-10-03']) call({ action: 'create', date, name: 'Cursa' });
  const result = call({ action: 'list', from: '2026-11-10' });
  assert.equal(result.ok, true); assert.equal(result.from, '2026-11-10');
  assert.deepEqual(result.events.map(event => event.date), ['2026-11-10', '2027-12-01', '2030-10-03']);
  assert.equal(call({ action: 'list', from: '2027-02-29' }).ok, false);
});
