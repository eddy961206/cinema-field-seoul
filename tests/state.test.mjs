import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filterRooms, readState, stateURL, parseVideo } from "../dist/state.js";
import { roomConfig, seatLabelInfo } from "../dist/model.js";
const catalogue = JSON.parse(
  await readFile(new URL("../dist/catalog.json", import.meta.url), "utf8"),
);
const rooms = catalogue.rooms;
test("shared settings round-trip beneath a project subpath without preserving video input", () => {
  const state = {
    party: "friends_123",
    room: "gwanggyo-imax",
    row: 3,
    seat: 7,
    ratio: 2.39,
    source: 16 / 9,
    mode: "seat",
    frontDistance: 12.5,
    pitch: 1.6,
    rise: 0.5,
  };
  const url = new URL(
    stateURL(
      "https://example.org/cinema-field-seoul/?video=private#old",
      state,
    ),
  );
  assert.equal(url.pathname, "/cinema-field-seoul/");
  assert.equal(url.searchParams.has("video"), false);
  assert.equal(url.hash, "");
  assert.deepEqual(readState(url.search, rooms), state);
});
test("malformed public links cannot select a closed room or create non-finite geometry", () => {
  const s = readState(
    "?room=pangyo-imax&row=999999&seat=-12&ratio=NaN&front=Infinity&pitch=-99&rise=bad&mode=oops",
    rooms,
  );
  assert.equal(s.room, "yongsan-imax");
  assert.equal(s.row, 16);
  assert.equal(s.seat, 1);
  assert.equal(s.ratio, 1.43);
  assert.equal(s.frontDistance, 10);
  assert.equal(s.pitch, 0.9);
  assert.equal(s.rise, 0.35);
  assert.equal(s.mode, "orbit");
});
test("search composes region and format, handles spaces, and excludes closed rooms", () => {
  assert.equal(
    filterRooms(rooms, { query: "  광교  ", region: "경기", format: "IMAX" })
      .length,
    1,
  );
  assert.equal(filterRooms(rooms, { query: "판교" }).length, 0);
  assert.equal(filterRooms(rooms, { query: "용아맥" })[0].id, "yongsan-imax");
  assert.equal(filterRooms(rooms, { query: "no such theater" }).length, 0);
});
test("only supported YouTube URLs are accepted; lookalike hosts and protocols are rejected", () => {
  for (const value of [
    "aqz-KE-bpKQ",
    "https://youtu.be/aqz-KE-bpKQ?t=3",
    "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    "https://m.youtube.com/shorts/aqz-KE-bpKQ",
  ])
    assert.equal(parseVideo(value), "aqz-KE-bpKQ");
  for (const value of [
    "https://youtube.com.evil.example/watch?v=aqz-KE-bpKQ",
    "javascript:alert(1)",
    "https://www.youtube.com/channel/aqz-KE-bpKQ",
    "ftp://youtu.be/aqz-KE-bpKQ",
  ])
    assert.equal(parseVideo(value), null);
});
test("44 observed labels are mapped to the original schematic cells; unknowns remain model labels", () => {
  let known = 0;
  for (const room of rooms) {
    const config = roomConfig(room);
    for (let row = 1; row <= config.rows; row++)
      for (let seat = 1; seat <= config.rowCounts[row - 1]; seat++) {
        const info = seatLabelInfo(config, row, seat),
          raw = room.seat_map?.value?.rows[row - 1]?.seat_labels?.[seat - 1];
        assert.equal(info.verified, !!raw);
        if (raw) {
          known++;
          assert.equal(info.rowLabel + info.seatLabel, raw);
          assert.equal(info.description.startsWith("자료 확인"), true);
        } else assert.equal(info.description.startsWith("모델"), true);
      }
  }
  assert.equal(known, 44);
  const config = roomConfig(rooms.find((r) => r.id === "yongsan-imax"));
  const index = config.rowColumns[0].indexOf(18) + 1;
  assert.equal(seatLabelInfo(config, 1, index).label, "A–17");
  assert.notEqual(index, 17);
});
