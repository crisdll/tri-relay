import { dateKey, monthDays, normalizeName } from './calendar.js';
import { MonthStore } from './month-store.js';
const $ = id => document.getElementById(id);
const config = window.TRI_CONFIG || {};
const demo = new URLSearchParams(location.search).get('demo') === '1';
const today = new Date();
const mobileLayout = window.matchMedia('(max-width: 740px)');
let month = new Date(today.getFullYear(), today.getMonth(), 1, 12);
let selected = null, events = [], activeId = null, busy = false, loaded = false, requestNumber = 0, toastTimer;
let loadError = null, refreshPending = false, lastResume = 0;
const monthFormat = new Intl.DateTimeFormat('ca-ES', { month: 'long', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat('ca-ES', { day: 'numeric', month: 'long' });
const fullFormat = new Intl.DateTimeFormat('ca-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const parseDate = key => new Date(`${key}T12:00:00`);
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

function notify(message, error = false) {
  $('status').textContent = message; $('status').classList.toggle('error', error); $('status').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('status').hidden = true; }, error ? 9000 : 4000);
}
function readDemo() {
  const saved = localStorage.getItem('tri-relay-demo-v1');
  if (saved) {
    const labels = { 'demo-1': ['Salida en bici · ruta de la costa', 'Sortida en bici · ruta de la costa'], 'demo-2': ['Entrenamiento de aguas abiertas', 'Entrenament en aigües obertes'], 'demo-3': ['Triatlón del equipo', 'Triatló de l’equip'] };
    return JSON.parse(saved).map(event => {
      const label = labels[event.id];
      return label && event.name === label[0] ? { ...event, name: label[1] } : event;
    });
  }
  const key = day => dateKey(new Date(today.getFullYear(), today.getMonth(), day, 12));
  return [
    { id: 'demo-1', date: key(14), name: 'Sortida en bici · ruta de la costa', participants: [{ name: 'Cris' }, { name: 'Dani' }, { name: 'Marta' }] },
    { id: 'demo-2', date: key(14), name: 'Entrenament en aigües obertes', participants: [{ name: 'Álex' }] },
    { id: 'demo-3', date: key(22), name: 'Triatló de l’equip', participants: [{ name: 'Cris' }, { name: 'Marta' }] }
  ];
}
async function api(action, data = {}) {
  if (demo) {
    const all = readDemo();
    if (action === 'list') return { events: all.filter(event => event.date.startsWith(data.month)) };
    if (action === 'create') {
      const distance = (data.distance || '').trim().replace(/\s+/g, ' ');
      const existing = all.find(event => event.date === data.date && normalizeName(event.name) === normalizeName(data.name) && normalizeName(event.distance || '') === normalizeName(distance));
      if (existing) return { event: existing, existing: true };
      const event = { id: crypto.randomUUID(), date: data.date, name: data.name.trim().replace(/\s+/g, ' '), distance, participants: [] };
      all.push(event); localStorage.setItem('tri-relay-demo-v1', JSON.stringify(all)); return { event };
    }
    const event = all.find(event => event.id === data.eventId);
    if (!event) throw new Error('Aquest esdeveniment ja no existeix. Actualitza el calendari.');
    const existing = event.participants.some(person => normalizeName(person.name) === normalizeName(data.name));
    if (!existing) event.participants.push({ name: data.name.trim().replace(/\s+/g, ' ') });
    localStorage.setItem('tri-relay-demo-v1', JSON.stringify(all)); return { event, existing };
  }
  if (!config.apiUrl) throw new Error('Falta connectar el full de Google. Pots provar la demo.');
  let response;
  try {
    response = await fetch(config.apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data }), credentials: 'omit', redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(30000)
    });
  } catch { throw new Error('No hem pogut connectar. Revisa la connexió i prem Actualitza. Si estaves desant, comprova primer si el canvi ja apareix.'); }
  if (!response.ok) throw new Error('El calendari no està disponible ara. Torna-ho a provar.');
  let result;
  try { result = await response.json(); } catch { throw new Error('Comprova que Apps Script estigui publicat amb accés per a tothom.'); }
  if (!result.ok) throw new Error(result.error || 'No hem pogut desar el canvi. Torna-ho a provar.');
  return result;
}
let calendarStorage = null;
try { if (!demo) calendarStorage = window.localStorage; } catch { /* Persistent storage may be disabled. */ }
const monthStore = new MonthStore({
  fetchMonth: async key => (await api('list', { month: key })).events,
  storage: calendarStorage,
  storageKey: `tri-relay-months-v1:${config.apiUrl || 'unconfigured'}`
});
function renderCalendar() {
  $('month-label').textContent = monthFormat.format(month);
  $('calendar').replaceChildren();
  for (const day of monthDays(month.getFullYear(), month.getMonth())) {
    const plans = events.filter(event => event.date === day.key);
    const button = element('button', `day${day.outside ? ' outside' : ''}${day.key === dateKey(today) ? ' is-today' : ''}${day.key === selected ? ' selected' : ''}`, day.day);
    button.type = 'button'; button.setAttribute('aria-pressed', String(day.key === selected));
    button.setAttribute('aria-label', `${fullFormat.format(parseDate(day.key))}${day.outside || !loaded ? '' : `, ${plans.length} ${plans.length === 1 ? 'esdeveniment' : 'esdeveniments'}`}`);
    if (day.key === dateKey(today)) button.setAttribute('aria-current', 'date');
    if (plans.length) { const dots = element('span', 'day-dots'); dots.setAttribute('aria-hidden', 'true'); for (let i = 0; i < Math.min(plans.length, 3); i++) dots.append(element('i', 'dot')); button.append(dots); }
    button.addEventListener('click', () => selectDay(day.key, day.outside)); $('calendar').append(button);
  }
}
function empty(title, copy) {
  const wrapper = element('div', 'empty-state'); wrapper.append(element('span', 'empty-icon', '↗')); if (title) wrapper.append(element('h3', '', title)); wrapper.append(element('p', '', copy)); return wrapper;
}
function renderDay() {
  $('day-label').textContent = selected ? dayFormat.format(parseDate(selected)) : 'Tria un dia';
  $('day-count').hidden = true; $('new-event').hidden = true; $('create-form').hidden = true;
  const content = $('day-content'); content.replaceChildren();
  if (!selected) { content.append(empty('', 'Toca una data per veure o crear esdeveniments.')); return; }
  if (!demo && !config.apiUrl) { content.append(empty('Calendari pendent de connectar', 'Falta connectar el full. Pots provar la demo amb l’enllaç de dalt.')); return; }
  if (!loaded) {
    content.append(empty(loadError ? 'No hem pogut carregar els esdeveniments.' : 'Carregant…', loadError ? 'Comprova la connexió i torna-ho a provar.' : 'Carregant els esdeveniments del dia.'));
    if (!loadError) { const spinner = element('span', 'loading-spinner'); spinner.setAttribute('aria-hidden', 'true'); content.firstElementChild.querySelector('.empty-icon').replaceChildren(spinner); }
    if (loadError) { const retry = element('button', 'button secondary full-width', 'Actualitza'); retry.addEventListener('click', () => loadMonth({ force: true })); content.append(retry); }
    return;
  }
  const plans = events.filter(event => event.date === selected);
  $('day-count').textContent = plans.length; $('day-count').hidden = false; $('new-event').hidden = false;
  if (!plans.length) content.append(empty('Cap esdeveniment', 'Pots crear-ne un per a aquest dia.'));
  for (const event of plans) {
    const button = element('button', 'event-card'); button.type = 'button';
    const heading = element('div', 'event-card-top');
    const title = element('div', 'event-title-line'); title.append(element('h3', '', event.name));
    if (event.distance) title.append(element('span', 'event-tag', event.distance));
    heading.append(title, element('span', 'arrow', '↗')); button.append(heading);
    button.append(element('p', '', `${event.participants.length} ${event.participants.length === 1 ? 'persona apuntada' : 'persones apuntades'} · Veure i apuntar-m’hi`));
    button.addEventListener('click', () => openEvent(event.id)); content.append(button);
  }
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('#create-form button, #join-form button, #new-event').forEach(button => { button.disabled = value; });
  if (!value && refreshPending) { refreshPending = false; refreshOnReturn(); }
}
function drawMonth(preserveEditor) {
  renderCalendar();
  if (!preserveEditor || $('create-form').hidden) renderDay();
  if ($('event-dialog').open) renderEvent();
}
function warmNeighbors() {
  monthStore.prefetch([1, 2, -1].map(offset => dateKey(new Date(month.getFullYear(), month.getMonth() + offset, 1, 12)).slice(0, 7)));
}
function setSyncState(syncing, offline = false) {
  $('sync-label').textContent = syncing ? (loaded ? 'Actualitzant…' : 'Carregant…') : (offline ? 'Sense connexió' : '');
  $('sync-status').hidden = !syncing && !offline;
  $('sync-spinner').hidden = !syncing;
  $('calendar-loading').hidden = !syncing || loaded;
  $('calendar').setAttribute('aria-busy', String(syncing && !loaded));
}
async function loadMonth({ force = false, preserveEditor = false } = {}) {
  const request = ++requestNumber;
  const key = dateKey(month).slice(0, 7);
  const cached = monthStore.peek(key);
  loaded = Boolean(cached); events = cached?.events || []; loadError = null;
  drawMonth(preserveEditor);
  if (!force && monthStore.isFresh(key)) { setSyncState(false); warmNeighbors(); return; }
  setSyncState(true);
  const reading = monthStore.refresh(key, { priority: true });
  warmNeighbors();
  try {
    const result = await reading;
    if (request !== requestNumber) return;
    events = result.events; loaded = true; setSyncState(false); drawMonth(true);
  } catch (error) {
    if (request !== requestNumber) return;
    loadError = error; setSyncState(false, true);
    notify(error.message, true);
    drawMonth(true);
  }
}
function selectDay(key, outside) {
  if (busy) return;
  selected = key;
  if (outside) { month = new Date(parseDate(key).getFullYear(), parseDate(key).getMonth(), 1, 12); loadMonth(); }
  else { renderCalendar(); renderDay(); }
  showDayPanel();
  window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
}
function showDayPanel() {
  if (!mobileLayout.matches) return;
  $('day-dialog-slot').append($('day-panel'));
  if (!$('day-dialog').open) $('day-dialog').showModal();
}
function restoreDesktopPanel() {
  if (mobileLayout.matches) return;
  $('day-dialog').close();
  $('day-panel-home').append($('day-panel'));
}
mobileLayout.addEventListener('change', restoreDesktopPanel);
$('close-day').addEventListener('click', () => { if (!busy) $('day-dialog').close(); });
$('day-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
function openEvent(id) {
  activeId = id; $('dialog-status').textContent = ''; renderEvent();
  try { $('person-name').value = localStorage.getItem('tri-relay-name') || ''; } catch { /* Name memory is optional. */ }
  if (!$('event-dialog').open) $('event-dialog').showModal();
}
function renderEvent() {
  const event = events.find(item => item.id === activeId); if (!event) return;
  $('event-title').textContent = event.name; $('event-date').textContent = fullFormat.format(parseDate(event.date));
  $('event-distance-label').textContent = event.distance || ''; $('event-distance-label').hidden = !event.distance;
  $('participant-count').textContent = `${event.participants.length} ${event.participants.length === 1 ? 'persona apuntada' : 'persones apuntades'}`;
  $('participants').replaceChildren();
  if (!event.participants.length) $('participants').append(element('li', 'muted', 'Encara no hi ha ningú apuntat.'));
  for (const person of event.participants) {
    const item = element('li'); const initials = person.name.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
    const avatar = element('span', 'avatar', initials); avatar.setAttribute('aria-hidden', 'true');
    item.append(avatar, element('span', '', person.name)); $('participants').append(item);
  }
}
function upsert(event) { monthStore.upsert(event); events = monthStore.peek(dateKey(month).slice(0, 7))?.events || []; }
$('previous').addEventListener('click', () => changeMonth(-1));
$('next').addEventListener('click', () => changeMonth(1));
function changeMonth(direction) { if (busy) return; month = new Date(month.getFullYear(), month.getMonth() + direction, 1, 12); selected = null; loadMonth(); }
$('today').addEventListener('click', () => { if (busy) return; month = new Date(today.getFullYear(), today.getMonth(), 1, 12); selected = null; loadMonth({ force: true }); });
$('new-event').addEventListener('click', () => {
  if (!selected || !loaded) return;
  $('create-date').textContent = fullFormat.format(parseDate(selected)); $('create-form').hidden = false; $('new-event').hidden = true; $('event-name').value = ''; $('event-distance').value = ''; $('event-name').focus();
});
$('cancel-create').addEventListener('click', renderDay);
$('create-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !selected || !loaded) return;
  const name = $('event-name').value.trim(); if (!name) { $('event-name').setCustomValidity('Escriu el nom de l’esdeveniment.'); $('event-name').reportValidity(); return; }
  setBusy(true);
  try { const result = await api('create', { date: selected, name, distance: $('event-distance').value.trim() }); upsert(result.event); renderCalendar(); renderDay(); openEvent(result.event.id); notify(result.existing ? 'Aquest esdeveniment i modalitat ja existeixen. Pots apuntar-t’hi aquí.' : 'Esdeveniment creat. Ja pots apuntar-t’hi.'); }
  catch (error) { notify(error.message, true); } finally { setBusy(false); }
});
$('event-name').addEventListener('input', () => $('event-name').setCustomValidity(''));
$('person-name').addEventListener('input', () => $('person-name').setCustomValidity(''));
$('join-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !activeId) return;
  const name = $('person-name').value.trim(); if (!name) { $('person-name').setCustomValidity('Escriu el teu nom.'); $('person-name').reportValidity(); return; }
  setBusy(true); $('dialog-status').textContent = 'Desant el teu nom…';
  try {
    const result = await api('join', { eventId: activeId, name }); upsert(result.event); renderCalendar(); renderDay(); renderEvent();
    try { localStorage.setItem('tri-relay-name', name); } catch { /* Joining works without local storage. */ }
    if (!result.existing) $('person-name').value = '';
    $('dialog-status').textContent = result.existing ? 'Aquest nom ja és a la llista. Si sou dues persones diferents, afegeix el cognom.' : 'Ja ets a la llista!';
  } catch (error) { $('dialog-status').textContent = error.message; } finally { setBusy(false); }
});
$('close-dialog').addEventListener('click', () => { if (!busy) $('event-dialog').close(); });
$('event-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
function refreshOnReturn() {
  if (document.visibilityState === 'hidden' || (!demo && !config.apiUrl)) return;
  if (busy) { refreshPending = true; return; }
  if (Date.now() - lastResume < 1500) return;
  lastResume = Date.now();
  loadMonth({ force: true, preserveEditor: true });
}
document.addEventListener('visibilitychange', refreshOnReturn);
window.addEventListener('focus', refreshOnReturn);
window.addEventListener('online', refreshOnReturn);
window.addEventListener('pageshow', event => { if (event.persisted) refreshOnReturn(); });
if (demo) { $('notice').textContent = 'DEMO · Dades de prova només en aquest navegador. No es comparteixen amb l’equip.'; $('notice').hidden = false; }
else if (!config.apiUrl) {
  $('notice').append(document.createTextNode('El calendari encara no està connectat. ')); const link = element('a', '', 'Prova la demo ↗'); link.href = '?demo=1'; $('notice').append(link); $('notice').hidden = false;
}
try {
  const telegram = window.Telegram?.WebApp;
  telegram?.ready(); telegram?.expand();
  if (telegram?.isVersionAtLeast?.('8.0')) telegram.onEvent('activated', refreshOnReturn);
} catch { /* Also works in an ordinary browser. */ }
renderCalendar(); renderDay();
if (demo || config.apiUrl) loadMonth({ force: true }); else setSyncState(false);
