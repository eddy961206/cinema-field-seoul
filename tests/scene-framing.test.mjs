import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeRoomConfig,
  roomConfig,
  seatPosition,
  seatMetrics,
} from "../dist/model.js";
import { framingGeometry, FRAMING_RATIOS } from "../dist/framing.js";

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);

test("flat rows stay flat; malformed numbers cannot poison room geometry", () => {
  const flat = normalizeRoomConfig({ rise: 0 });
  assert.equal(flat.rise, 0);
  assert.equal(seatPosition(flat, flat.rows, 1).y, 0);
  const safe = normalizeRoomConfig({
    rows: Infinity,
    columns: NaN,
    pitch: Infinity,
    frontDistance: -3,
    rowColumns: [[], null, ["x"]],
  });
  assert.equal(safe.rowColumns, undefined);
  assert.equal(safe.rows, 12);
  assert.equal(safe.frontDistance, 2.5);
  assert.ok(
    Object.values(seatPosition(safe, 1, 1)).every(
      (value) => typeof value !== "number" || Number.isFinite(value),
    ),
  );
});

test("captured grid gaps remain gaps and wheelchair cells remain selectable", () => {
  const config = normalizeRoomConfig({
    rowColumns: [
      [0, 1, 4, 5],
      [1, 4],
    ],
    accessibleCells: [{ row: 1, column: 4 }],
  });
  close(seatPosition(config, 1, 3).x - seatPosition(config, 1, 2).x, 3 * 0.67);
  assert.equal(seatPosition(config, 1, 3).accessible, true);
  assert.equal(seatPosition(config, 2, 3), null);
  assert.equal(seatPosition(config, 0, 1), null);
  assert.equal(seatPosition(config, 1, Infinity), null);
});

test("same coordinates drive 2D metrics and 3D seat placement", () => {
  const config = normalizeRoomConfig({
    screenWidth: 20,
    screenHeight: 10,
    rowColumns: [
      [0, 2, 4],
      [0, 2, 4],
    ],
    frontDistance: 10,
    pitch: 2,
    rise: 0,
  });
  const centre = seatMetrics(config, 1, 2);
  close(centre.distance, 9.92);
  close(centre.offset, 0);
  close(centre.horizontalAngle, (2 * Math.atan(10 / 9.92) * 180) / Math.PI);
  const left = seatMetrics(config, 1, 1),
    right = seatMetrics(config, 1, 3);
  close(left.horizontalAngle, right.horizontalAngle);
  close(left.verticalAngle, right.verticalAngle);
  close(left.offset, -right.offset);
  assert.ok(seatMetrics(config, 2, 2).horizontalAngle < centre.horizontalAngle);
  assert.equal(seatMetrics(config, 99, 1), null);
});

test("all catalog seat positions and metrics stay finite and preserve reported grids", async () => {
  const catalog = JSON.parse(
    await readFile(new URL("../dist/catalog.json", import.meta.url), "utf8"),
  );
  for (const room of catalog.rooms) {
    const config = roomConfig(room);
    const grid = room.seat_map?.value?.rows;
    if (grid)
      assert.deepEqual(
        config.rowColumns,
        grid.map((row) => row.occupied_grid_columns_zero_based),
      );
    for (let row = 1; row <= config.rows; row++) {
      for (let seat = 1; seat <= config.rowCounts[row - 1]; seat++) {
        const metrics = seatMetrics(config, row, seat);
        assert.ok(
          Object.values(metrics).every(Number.isFinite),
          `${room.id} ${row}-${seat}`,
        );
        assert.ok(metrics.horizontalAngle > 0 && metrics.horizontalAngle < 180);
        assert.ok(metrics.verticalAngle > 0 && metrics.verticalAngle < 180);
      }
    }
  }
});

test("1.43 source to 2.39 output crops only the upper and lower bands", () => {
  const wide = framingGeometry(1.43, 2.39);
  close(wide.retainedFraction, 143 / 239);
  close(wide.cropFraction * 2 + wide.retainedFraction, 1);
  assert.equal(wide.letterboxFraction, 0);
  assert.equal(wide.displayRatio, 1.43);
});

test("a 16:9 source in a taller output adds black space without restoring missing scenery", () => {
  const tall = framingGeometry(16 / 9, 1.43);
  assert.equal(tall.retainedFraction, 1);
  assert.equal(tall.cropFraction, 0);
  close(tall.letterboxFraction, (1 - 1.43 / (16 / 9)) / 2);
  for (const ratio of FRAMING_RATIOS) {
    const same = framingGeometry(ratio, ratio);
    assert.equal(same.retainedFraction, 1);
    assert.equal(same.cropFraction, 0);
    assert.equal(same.letterboxFraction, 0);
  }
  assert.throws(() => framingGeometry(0, 1.43), RangeError);
  assert.throws(() => framingGeometry(1.43, Infinity), RangeError);
});
