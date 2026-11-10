/* Backend anónimo. Copiar en Apps Script; las instrucciones están en README.md. */
const EVENT_HEADERS = ['id', 'date', 'nameJson', 'nameKeyJson', 'createdAt', 'distanceJson'];
const PERSON_HEADERS = ['eventId', 'nameJson', 'nameKeyJson', 'createdAt'];

class CalendarError extends Error {}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse_({ ok: true, service: 'Tri Relay', version: 1 });
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 4096) throw new CalendarError('Petició no vàlida.');
    let input;
    try { input = JSON.parse(raw); } catch (_) { throw new CalendarError('Petició no vàlida.'); }
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new CalendarError('Petició no vàlida.');
    if (!['list', 'create', 'join'].includes(input.action)) throw new CalendarError('Acció no vàlida.');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw new CalendarError('Hi ha algú desant canvis. Torna-ho a provar en uns segons.');
    try { return jsonResponse_(Object.assign({ ok: true }, dispatch_(input))); }
    finally { lock.releaseLock(); }
  } catch (error) {
    if (!(error instanceof CalendarError)) console.error('Tri Relay: error interno del servicio.');
    return jsonResponse_({ ok: false, error: error instanceof CalendarError ? error.message : 'No hem pogut accedir al calendari. Revisa la configuració de Apps Script.' });
  }
}

function database_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new CalendarError('Falta configurar SPREADSHEET_ID a Apps Script.');
  return SpreadsheetApp.openById(id);
}

// Ejecutar una sola vez desde el editor. No borra ninguna hoja ni dato existente.
function setup() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('SPREADSHEET_ID')) {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (!active) throw new CalendarError('Obre Apps Script des de Extensions al full de càlcul i executa setup.');
    properties.setProperty('SPREADSHEET_ID', active.getId());
  }
  const book = database_();
  [['Eventos', EVENT_HEADERS], ['Personas', PERSON_HEADERS]].forEach(function (entry) {
    let sheet = book.getSheetByName(entry[0]);
    if (!sheet) sheet = book.insertSheet(entry[0]);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, entry[1].length).setValues([entry[1]]);
      sheet.setFrozenRows(1);
    }
    // Amplia la versió anterior sense modificar els esdeveniments ni les inscripcions.
    if (entry[0] === 'Eventos' && sheet.getRange(1, 1, 1, 5).getValues()[0].join('|') === EVENT_HEADERS.slice(0, 5).join('|') && sheet.getRange(1, 6, 1, 1).getValues()[0][0] === '') {
      sheet.getRange(1, 6, 1, 1).setValues([['distanceJson']]);
    }
    checkSheet_(sheet, entry[1]);
  });
}

function checkSheet_(sheet, headers) {
  if (!sheet || sheet.getLastRow() < 1 || sheet.getRange(1, 1, 1, headers.length).getValues()[0].join('|') !== headers.join('|')) {
    throw new CalendarError('Falten les taules o han canviat les columnes. Executa setup i conserva les capçaleres.');
  }
}

function rows_(sheet, columns) {
  return sheet.getLastRow() <= 1 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, columns).getValues();
}

function append_(sheet, row) {
  // JSON para nombres: incluso un nombre que empieza por '=' es texto, nunca una fórmula.
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
}

function cleanName_(value, maximum) {
  if (typeof value !== 'string') throw new CalendarError('Escriu un nom vàlid.');
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > maximum || /[\u0000-\u001f\u007f]/.test(clean)) throw new CalendarError('El nom ha de tenir entre 1 i ' + maximum + ' caràcters.');
  return clean;
}

function nameKey_(name) { return name.toLocaleLowerCase('es'); }

function distance_(value) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > 60 || /[\u0000-\u001f\u007f]/.test(value)) throw new CalendarError('La distància o modalitat ha de tenir com a màxim 60 caràcters.');
  return value.trim().replace(/\s+/g, ' ');
}

function rowDistance_(row) { return row[5] ? JSON.parse(row[5]) : ''; }

function validDate_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new CalendarError('Tria un dia vàlid del calendari.');
  const date = new Date(value + 'T12:00:00Z');
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) < 2000 || Number(value.slice(0, 4)) > 2100) throw new CalendarError('Tria un dia vàlid del calendari (2000–2100).');
  return value;
}

function eventView_(row, people) {
  return { id: String(row[0]), date: String(row[1]), name: JSON.parse(row[2]), distance: rowDistance_(row), participants: people.filter(function (person) { return String(person[0]) === String(row[0]); }).map(function (person) { return { name: JSON.parse(person[1]) }; }) };
}

function dispatch_(input) {
  const book = database_();
  const eventsSheet = book.getSheetByName('Eventos');
  const peopleSheet = book.getSheetByName('Personas');
  checkSheet_(eventsSheet, EVENT_HEADERS); checkSheet_(peopleSheet, PERSON_HEADERS);
  const events = rows_(eventsSheet, EVENT_HEADERS.length);
  const people = rows_(peopleSheet, PERSON_HEADERS.length);
  if (input.action === 'list') {
    if (input.from !== undefined) {
      const from = validDate_(input.from);
      return { from: from, events: events.filter(function (row) { return String(row[1]) >= from; }).map(function (row) { return eventView_(row, people); }) };
    }
    if (typeof input.month !== 'string' || !/^\d{4}-\d{2}$/.test(input.month)) throw new CalendarError('Mes no vàlid.');
    validDate_(input.month + '-01');
    return { events: events.filter(function (row) { return String(row[1]).slice(0, 7) === input.month; }).map(function (row) { return eventView_(row, people); }) };
  }
  if (input.action === 'create') {
    const date = validDate_(input.date), name = cleanName_(input.name, 100), key = nameKey_(name), distance = distance_(input.distance);
    const existing = events.find(function (row) { return String(row[1]) === date && JSON.parse(row[3]) === key && nameKey_(rowDistance_(row)) === nameKey_(distance); });
    if (existing) return { event: eventView_(existing, people), existing: true };
    const row = [Utilities.getUuid(), date, JSON.stringify(name), JSON.stringify(key), new Date().toISOString(), JSON.stringify(distance)];
    append_(eventsSheet, row);
    return { event: eventView_(row, people), existing: false };
  }
  if (typeof input.eventId !== 'string' || input.eventId.length > 100) throw new CalendarError('Esdeveniment no vàlid.');
  const event = events.find(function (row) { return String(row[0]) === input.eventId; });
  if (!event) throw new CalendarError('Aquest esdeveniment ja no existeix. Actualitza el calendari.');
  const name = cleanName_(input.name, 60), key = nameKey_(name);
  const existing = people.some(function (person) { return String(person[0]) === input.eventId && JSON.parse(person[2]) === key; });
  if (!existing) {
    const row = [input.eventId, JSON.stringify(name), JSON.stringify(key), new Date().toISOString()];
    append_(peopleSheet, row); people.push(row);
  }
  return { event: eventView_(event, people), existing: existing };
}
