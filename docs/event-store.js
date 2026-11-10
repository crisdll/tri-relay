import { upcomingEvents } from './event-list.js?v=15';

export class EventStore {
  constructor({ fetchEvents, storage = null, storageKey = 'tri-relay-events-v1', now = Date.now }) {
    this.fetchEvents = fetchEvents; this.storage = storage; this.storageKey = storageKey; this.now = now;
    this.snapshot = null; this.pending = null; this.revision = 0; this.replacement = 0; this.writes = new Map();
    try {
      const saved = JSON.parse(storage?.getItem(storageKey) || 'null');
      if (saved && Number.isFinite(saved.fetchedAt) && saved.fetchedAt <= now() && now() - saved.fetchedAt < 7 * 86400000 && validEvents(saved.events)) this.snapshot = saved;
    } catch { /* Persistent caching is optional. */ }
  }
  peek(from) { return this.snapshot ? { events: upcomingEvents(this.snapshot.events, from), fetchedAt: this.snapshot.fetchedAt } : null; }
  persist() { try { this.storage?.setItem(this.storageKey, JSON.stringify(this.snapshot)); } catch { /* Memory caching still works. */ } }
  replace(events, from) {
    if (!validEvents(events)) throw new Error('Resposta del calendari no vàlida.');
    this.replacement++;
    this.snapshot = { events: upcomingEvents(events, from), fetchedAt: this.now() }; this.persist();
  }
  refresh(from) {
    if (this.pending) return this.pending;
    const revision = this.revision, replacement = this.replacement;
    this.pending = Promise.resolve().then(() => this.fetchEvents(from)).then(events => {
      if (!validEvents(events)) throw new Error('Resposta del calendari no vàlida.');
      if (replacement === this.replacement) {
        const merged = new Map(events.map(event => [event.id, event]));
        for (const [id, write] of this.writes) if (write.revision > revision) merged.set(id, write.event);
        this.snapshot = { events: upcomingEvents([...merged.values()], from), fetchedAt: this.now() }; this.persist();
      }
      return this.peek(from);
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  upsert(event, from) {
    this.revision++;
    this.writes.set(event.id, { event, revision: this.revision });
    const merged = new Map((this.snapshot?.events || []).map(item => [item.id, item])); merged.set(event.id, event);
    this.snapshot = { events: upcomingEvents([...merged.values()], from), fetchedAt: this.snapshot?.fetchedAt ?? this.now() }; this.persist();
  }
}

function validEvents(events) {
  return Array.isArray(events) && events.every(event => event && typeof event.id === 'string' && typeof event.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.date) && Array.isArray(event.participants) && event.participants.every(person => person && typeof person.name === 'string'));
}
