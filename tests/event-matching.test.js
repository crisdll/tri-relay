import test from 'node:test';
import assert from 'node:assert/strict';
import { findSimilarEvents } from '../docs/event-matching.js';

const event = (name, distance = '', date = '2027-04-11') => ({ id: name + distance, name, distance, date, participants: [] });
const draft = (name, distance = '') => ({ name, distance, date: '2027-04-11' });

test('detecta coincidències exactes amb espais i majúscules diferents', () => {
  const matches = findSimilarEvents([event('Challenge Barcelona', 'Half')], draft('  challenge   BARCELONA ', 'half'));
  assert.equal(matches.length, 1); assert.equal(matches[0].exact, true);
});

test('avisa de petites errades, accents, abreviacions i paraules en un ordre diferent', () => {
  for (const [existing, proposed] of [
    ['Challenge Barcelona', 'Challange Barcelona'],
    ['Tritour Deltebre', 'Tritour Deltebre!'],
    ['Marató Barcelona', 'Marato Barcelona'],
    ['Hyrox BCN', 'Hyrox Barcelona'],
    ['Jean Bouin', 'Jean Bouin 10K'],
    ['Challenge Barcelona', 'Barcelona Challenge']
  ]) assert.equal(findSimilarEvents([event(existing)], draft(proposed)).length, 1, proposed);
});

test('no confon seus diferents ni noms curts diferents', () => {
  for (const [existing, proposed] of [
    ['Hyrox Bilbao', 'Hyrox Madrid'],
    ['Gran Fondo Lloret', 'Gran Fondo Calella'],
    ['Run', 'Fun'],
    ['Sansi El Masnou', 'Jean Bouin']
  ]) assert.equal(findSimilarEvents([event(existing)], draft(proposed)).length, 0, proposed);
});

test('només consulta coincidències del dia seleccionat i separa les modalitats', () => {
  const all = [event('Tritour Deltebre', 'Olímpica'), event('Tritour Deltebre', 'Half'), event('Tritour Deltebre', 'Sprint', '2027-04-12')];
  const matches = findSimilarEvents(all, draft('Tritour Deltebre', 'Half'));
  assert.equal(matches.length, 2);
  assert.equal(matches[0].event.distance, 'Half'); assert.equal(matches[0].exact, true);
  assert.equal(matches[1].event.distance, 'Olímpica'); assert.equal(matches[1].exact, false);
});
