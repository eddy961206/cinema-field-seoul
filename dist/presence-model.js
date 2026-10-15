export const VISITOR_COLORS = [
  "#63d8b3",
  "#f2bd66",
  "#8ca8ff",
  "#f392b3",
  "#b5de7a",
  "#bfa0ed",
];
export function visitorColor(id) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return VISITOR_COLORS[hash % VISITOR_COLORS.length];
}
export function normalizeParty(value) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value || "") ? value : "lobby";
}
export function validateVisitor(data, config) {
  if (!data || typeof data !== "object" || data.v !== 1) return null;
  if (!Number.isInteger(data.row) || data.row < 1 || data.row > config.rows)
    return null;
  const count = config.rowCounts?.[data.row - 1] || config.columns;
  if (!Number.isInteger(data.seat) || data.seat < 1 || data.seat > count)
    return null;
  // A visitor marks a selected seat. Camera movement is private and never transmitted.
  return { v: 1, row: data.row, seat: data.seat };
}
