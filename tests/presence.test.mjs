import test from "node:test";
import assert from "node:assert/strict";
import { createChannel, selfId } from "../src/presence-crypto.js";
import {
  normalizeParty,
  validateVisitor,
  visitorColor,
  VISITOR_COLORS,
} from "../dist/presence-model.js";

test("shared party and auditorium decrypt messages, unrelated groups cannot", async () => {
  const a = await createChannel("friends:yongsan"),
    b = await createChannel("friends:yongsan");
  const otherParty = await createChannel("strangers:yongsan"),
    otherRoom = await createChannel("friends:gwanggyo");
  const payload = { v: 1, row: 4, seat: 12, seq: 1, bye: false };
  const event = await a.encode(payload);
  assert.equal(event.pubkey, selfId);
  assert.deepEqual(await b.decode(event), payload);
  assert.equal(await otherParty.decode(event), null);
  assert.equal(await otherRoom.decode(event), null);
  assert.equal(event.content.includes("seat"), false);
});
test("altered signatures, content, tags, and stale events are rejected", async () => {
  const channel = await createChannel("test:room"),
    event = await channel.encode({ v: 1, row: 1, seat: 1, seq: 1 });
  for (const change of [
    { sig: "0".repeat(128) },
    { content: event.content.slice(0, -1) + "A" },
    { tags: [["x", "another-room"]] },
    { created_at: event.created_at - 100 },
    { id: "f".repeat(64) },
    { content: "x".repeat(1025) },
  ])
    assert.equal(await channel.decode({ ...event, ...change }), null);
});
test("peer data is limited to valid selectable seats, excluding arbitrary content", () => {
  const config = { rows: 2, columns: 4, rowCounts: [2, 4] };
  assert.deepEqual(
    validateVisitor(
      { v: 1, row: 2, seat: 4, name: "<script>", x: Infinity },
      config,
    ),
    { v: 1, row: 2, seat: 4 },
  );
  for (const data of [
    null,
    { v: 2, row: 1, seat: 1 },
    { v: 1, row: 1, seat: 3 },
    { v: 1, row: 0, seat: 1 },
    { v: 1, row: 2, seat: NaN },
    { v: 1, row: 1.5, seat: 1 },
  ])
    assert.equal(validateVisitor(data, config), null);
  assert.equal(normalizeParty("friends_42"), "friends_42");
  assert.equal(normalizeParty("bad/group"), "lobby");
  assert.equal(visitorColor("peer"), visitorColor("peer"));
  assert(VISITOR_COLORS.includes(visitorColor("peer")));
});
