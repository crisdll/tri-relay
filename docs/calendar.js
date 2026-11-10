export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function monthDays(year, month) {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(year, month, i - offset + 1, 12);
    return { key: dateKey(date), day: date.getDate(), outside: date.getMonth() !== month };
  });
}
export function normalizeName(value) { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es'); }
