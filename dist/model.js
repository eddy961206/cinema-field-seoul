/** Shared, approximate auditorium geometry. All lengths are metres; seats are 1-indexed. */
export const SCREEN_BOTTOM = 1.55;
export const SEATED_EYE_HEIGHT = 1.12;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const degrees = (radians) => (radians * 180) / Math.PI;
const cleanLabel = (value) =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 12)
    : "";

export function alphabeticalRow(row) {
  let label = "";
  for (let index = row; index > 0; index = Math.floor((index - 1) / 26))
    label = String.fromCharCode(65 + ((index - 1) % 26)) + label;
  return label;
}

export function normalizeRoomConfig(values = {}) {
  const config = { ...values };
  config.screenWidth = clamp(finite(config.screenWidth, 15.5), 4, 36);
  config.screenHeight = clamp(finite(config.screenHeight, 6.5), 2, 40);
  config.rows = clamp(Math.round(finite(config.rows, 12)), 1, 35);
  config.columns = clamp(Math.round(finite(config.columns, 25)), 4, 80);
  const grid = Array.isArray(config.rowColumns)
    ? config.rowColumns
        .slice(0, 35)
        .map((row) =>
          Array.isArray(row)
            ? [
                ...new Set(
                  row
                    .map(Number)
                    .filter(
                      (column) =>
                        Number.isInteger(column) && column >= 0 && column < 80,
                    ),
                ),
              ].sort((a, b) => a - b)
            : [],
        )
    : [];
  if (grid.length && grid.every((row) => row.length)) {
    // Labels follow the original occupied-column order even when a grid needs sorting.
    config.seatLabels = grid.map((row, r) =>
      row.map((column) =>
        cleanLabel(
          values.seatLabels?.[r]?.[
            values.rowColumns[r].findIndex((value) => Number(value) === column)
          ],
        ),
      ),
    );
    config.rowColumns = grid;
    config.rows = grid.length;
    config.columns = Math.max(...grid.flat()) + 1;
    config.rowCounts = grid.map((row) => row.length);
  } else {
    config.rowColumns = undefined;
    config.rowCounts = Array.from({ length: config.rows }, (_, i) =>
      clamp(
        Math.round(finite(config.rowCounts?.[i], config.columns)),
        1,
        config.columns,
      ),
    );
  }
  config.pitch = clamp(finite(config.pitch, 1.12), 0.85, 2.2);
  config.rise = clamp(finite(config.rise, 0.29), 0, 0.75);
  config.frontDistance = clamp(finite(config.frontDistance, 7.5), 2.5, 22);
  config.fov = clamp(finite(config.fov, 60), 35, 90);
  config.accessibleCells = Array.isArray(config.accessibleCells)
    ? config.accessibleCells
    : [];
  config.rowLabels = Array.from({ length: config.rows }, (_, i) =>
    cleanLabel(config.rowLabels?.[i]),
  );
  config.labelsVerified = config.labelsVerified === true;
  return config;
}

export function roomConfig(room) {
  const map = room.seat_map?.value;
  const grid = map?.rows?.map((row) => row.occupied_grid_columns_zero_based);
  const [screenWidth, screenHeight] = room.screen_m?.value || [28, 12];
  return normalizeRoomConfig({
    screenWidth,
    screenHeight,
    rows: grid?.length || 12,
    columns: grid?.length ? Math.max(...grid.flat()) + 1 : 25,
    rowColumns: grid,
    accessibleCells: room.seat_map?.value?.accessible_cells || [],
    rowLabels: map?.rows?.map(
      (row) => row.row_label ?? row.display_row_label ?? row.label,
    ),
    seatLabels: map?.rows?.map((row) => row.seat_labels),
    labelsVerified: map?.labels_verified === true,
    pitch: 1.3,
    rise: 0.35,
    frontDistance: 10,
    fov: 60,
  });
}

export function seatLabelInfo(config, row, seat) {
  if (!seatPosition(config, Number(row), Number(seat))) return null;
  const suppliedRow = cleanLabel(config.rowLabels?.[row - 1]);
  const suppliedSeat = cleanLabel(config.seatLabels?.[row - 1]?.[seat - 1]);
  const observed = /^([A-Z]+)(\d+)$/.exec(suppliedSeat);
  const rowLabel = observed?.[1] || suppliedRow || alphabeticalRow(Number(row));
  const seatLabel = observed?.[2] || suppliedSeat || String(seat);
  const verified =
    !!observed ||
    (config.labelsVerified === true && !!suppliedRow && !!suppliedSeat);
  return {
    label: `${rowLabel}–${seatLabel}`,
    rowLabel,
    seatLabel,
    verified,
    description: `${verified ? "자료 확인" : "모델"} ${rowLabel}열 ${seatLabel}번`,
  };
}

export function seatLabel(config, row, seat) {
  return seatLabelInfo(config, row, seat)?.label || "";
}

export function seatX(index, count) {
  const split1 = Math.max(2, Math.round(count * 0.25)),
    split2 = count - split1;
  return (
    (index - (count - 1) / 2) * 0.67 +
    (index >= split1 ? 1.03 : 0) +
    (index >= split2 ? 1.03 : 0) -
    1.03
  );
}

export function seatPosition(config, row, seat) {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(seat) ||
    row < 1 ||
    row > config.rows
  )
    return null;
  const columns = config.rowColumns?.[row - 1];
  const count =
    columns?.length ?? config.rowCounts?.[row - 1] ?? config.columns;
  if (seat < 1 || seat > count) return null;
  const column = columns ? columns[seat - 1] : seat - 1;
  const maxColumn = config.rowColumns
    ? Math.max(...config.rowColumns.flat())
    : config.columns - 1;
  return {
    row,
    seat,
    column,
    x: columns ? (column - maxColumn / 2) * 0.67 : seatX(seat - 1, count),
    y: (row - 1) * config.rise,
    z: config.frontDistance + (row - 1) * config.pitch,
    accessible:
      config.accessibleCells?.some(
        (cell) => cell.row === row && cell.column === column,
      ) || false,
  };
}

/** Angles describe the model, not a recommended seat or measured human field of view. */
export function seatMetrics(config, row, seat) {
  const position = seatPosition(config, Number(row), Number(seat));
  if (!position) return null;
  const distance = position.z - 0.055 - 0.025;
  const horizontalDistance = Math.hypot(position.x, distance);
  const eye = position.y + SEATED_EYE_HEIGHT;
  const bottom = SCREEN_BOTTOM - eye,
    top = bottom + config.screenHeight;
  return {
    distance,
    offset: position.x,
    horizontalAngle: degrees(
      Math.atan2(config.screenWidth / 2 - position.x, distance) -
        Math.atan2(-config.screenWidth / 2 - position.x, distance),
    ),
    verticalAngle: degrees(
      Math.atan2(top, horizontalDistance) -
        Math.atan2(bottom, horizontalDistance),
    ),
    viewingAngle: degrees(Math.atan2((top + bottom) / 2, horizontalDistance)),
  };
}
