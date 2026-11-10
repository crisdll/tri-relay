import { normalizeName } from './calendar.js';

function comparable(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('ca')
    .replace(/\bbcn\b/g, 'barcelona').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(value) {
  const ignored = new Set(['de', 'del', 'd', 'la', 'el', 'les', 'els', 'l', 'i']);
  return new Set(comparable(value).split(/\s+/).filter(word => word && !ignored.has(word)));
}

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

function similarity(a, b) {
  const left = comparable(a), right = comparable(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = tokens(a), rightTokens = tokens(b);
  const shared = [...leftTokens].filter(word => rightTokens.has(word)).length;
  const tokenScore = 2 * shared / (leftTokens.size + rightTokens.size || 1);
  const typoScore = Math.min(left.length, right.length) >= 5 ? 1 - editDistance(left, right) / Math.max(left.length, right.length) : 0;
  return Math.max(tokenScore >= 0.78 ? tokenScore : 0, typoScore >= 0.85 ? typoScore : 0);
}

export function findSimilarEvents(events, draft) {
  return events.filter(event => event.date === draft.date).map(event => ({
    event,
    score: similarity(event.name, draft.name),
    exact: normalizeName(event.name) === normalizeName(draft.name) && normalizeName(event.distance || '') === normalizeName(draft.distance || '')
  })).filter(match => match.score > 0 || match.exact).sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score);
}
