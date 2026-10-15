import { normalizeParty } from "./presence-model.js";
export const RATIOS = [1.43, 1.85, 1.9, 2.2, 2.39];
export const DEFAULT_MODEL = {
  frontDistance: 10,
  pitch: 1.3,
  rise: 0.35,
  fov: 60,
};
const bounded = (value, min, max, fallback) => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export function filterRooms(
  rooms,
  { query = "", region = "", format = "" } = {},
) {
  const q = query.trim().toLocaleLowerCase("ko");
  return rooms.filter(
    (r) =>
      !r.status?.startsWith("closed") &&
      (!region || r.region === region) &&
      (!format || r.format === format) &&
      `${r.name} ${r.region} ${r.format} ${r.address || ""} ${(r.tags || []).join(" ")}`
        .toLocaleLowerCase("ko")
        .includes(q),
  );
}
export function readState(search, rooms) {
  const p = new URLSearchParams(search),
    available = filterRooms(rooms);
  const room = available.find((r) => r.id === p.get("room")) || available[0];
  const rows = room.seat_map?.value?.rows;
  const row = Math.round(bounded(p.get("row"), 1, rows?.length || 12, 8));
  const count = rows?.[row - 1]?.occupied_grid_columns_zero_based.length || 25;
  return {
    party: normalizeParty(p.get("party")),
    room: room.id,
    row,
    seat: Math.round(bounded(p.get("seat"), 1, count, Math.ceil(count / 2))),
    ratio: RATIOS.includes(Number(p.get("ratio")))
      ? Number(p.get("ratio"))
      : 1.43,
    source: p.get("source") === "16:9" ? 16 / 9 : 1.43,
    mode: ["seat", "walk", "orbit"].includes(p.get("mode"))
      ? p.get("mode")
      : "orbit",
    frontDistance: bounded(p.get("front"), 5, 20, 10),
    pitch: bounded(p.get("pitch"), 0.9, 2.2, 1.3),
    rise: bounded(p.get("rise"), 0.15, 0.7, 0.35),
  };
}
export function stateURL(base, state) {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  const fields = {
    party: normalizeParty(state.party),
    room: state.room,
    row: state.row,
    seat: state.seat,
    ratio: state.ratio,
    source: state.source === 16 / 9 ? "16:9" : "1.43",
    mode: state.mode,
    front: state.frontDistance,
    pitch: state.pitch,
    rise: state.rise,
  };
  for (const [key, value] of Object.entries(fields))
    if (value !== undefined) url.searchParams.set(key, String(value));
  return url.href;
}
export function parseVideo(value) {
  const raw = value.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    if (!["https:", "http:"].includes(u.protocol)) return null;
    let id;
    if (u.hostname === "youtu.be") id = u.pathname.slice(1);
    else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "www.youtube-nocookie.com",
      ].includes(u.hostname)
    ) {
      const [, kind, pathId] = u.pathname.split("/");
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else if (["embed", "shorts", "live"].includes(kind)) id = pathId;
    }
    return /^[\w-]{11}$/.test(id || "") ? id : null;
  } catch {
    return null;
  }
}
