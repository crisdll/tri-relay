const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const FRESH_FOR = 60 * 1000;

export class MonthStore {
  constructor({ fetchMonth, storage = null, storageKey = 'tri-relay-months-v1', now = Date.now, concurrency = 3 }) {
    this.fetchMonth = fetchMonth;
    this.storage = storage;
    this.storageKey = storageKey;
    this.now = now;
    this.concurrency = concurrency;
    this.cache = new Map();
    this.revisions = new Map();
    this.pending = new Map();
    this.queue = [];
    this.running = 0;
    try {
      const saved = JSON.parse(storage?.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) for (const [key, entry] of saved) {
        if (entry && Number.isFinite(entry.fetchedAt) && entry.fetchedAt <= now() + 60000 && now() - entry.fetchedAt < MAX_AGE && validEvents(key, entry.events)) this.cache.set(key, entry);
      }
    } catch { /* Storage is optional; a fresh request can always load the calendar. */ }
  }

  peek(key) { return this.cache.get(key); }

  isFresh(key) {
    const entry = this.peek(key);
    return Boolean(entry && this.now() - entry.fetchedAt < FRESH_FOR);
  }

  persist() {
    const entries = [...this.cache].sort((a, b) => b[1].fetchedAt - a[1].fetchedAt).slice(0, 24);
    try { this.storage?.setItem(this.storageKey, JSON.stringify(entries)); } catch { /* Memory caching still works. */ }
  }

  refresh(key, { priority = false } = {}) {
    const existing = this.pending.get(key);
    if (existing) {
      const index = this.queue.indexOf(existing);
      if (priority && index > 0) { this.queue.splice(index, 1); this.queue.unshift(existing); }
      return existing.promise;
    }
    const task = { key };
    task.promise = new Promise((resolve, reject) => { task.resolve = resolve; task.reject = reject; });
    this.pending.set(key, task);
    if (priority) this.queue.unshift(task); else this.queue.push(task);
    this.pump();
    return task.promise;
  }

  pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const task = this.queue.shift();
      const revision = this.revisions.get(task.key) || 0;
      this.running++;
      Promise.resolve().then(() => this.fetchMonth(task.key)).then(events => {
        if (!validEvents(task.key, events)) throw new Error('Resposta del calendari no vàlida.');
        // A read started before a successful signup must not undo that signup.
        if (revision === (this.revisions.get(task.key) || 0)) {
          this.cache.set(task.key, { events, fetchedAt: this.now() });
          this.persist();
        }
        return this.peek(task.key);
      }).then(entry => {
        this.running--;
        this.pending.delete(task.key);
        this.pump();
        task.resolve(entry);
      }, error => {
        this.running--;
        this.pending.delete(task.key);
        this.pump();
        task.reject(error);
      });
    }
  }

  prefetch(keys) {
    for (const key of keys) if (!this.isFresh(key)) this.refresh(key).catch(() => {});
  }

  upsert(event) {
    const key = event.date.slice(0, 7);
    const old = this.peek(key);
    const events = [...(old?.events || [])];
    const index = events.findIndex(item => item.id === event.id);
    if (index < 0) events.push(event); else events[index] = event;
    this.revisions.set(key, (this.revisions.get(key) || 0) + 1);
    this.cache.set(key, { events, fetchedAt: old?.fetchedAt ?? this.now() });
    this.persist();
  }
}

function validEvents(key, events) {
  return /^\d{4}-\d{2}$/.test(key) && Array.isArray(events) && events.every(event =>
    event && typeof event.id === 'string' && typeof event.name === 'string' &&
    typeof event.date === 'string' && event.date.slice(0, 7) === key &&
    Array.isArray(event.participants) && event.participants.every(person => person && typeof person.name === 'string')
  );
}
