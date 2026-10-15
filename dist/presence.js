import { createChannel, selfId, EVENT_KIND } from "./vendor/presence-crypto.js";
import {
  normalizeParty,
  validateVisitor,
  visitorColor,
} from "./presence-model.js";

// Public NIP-01 relays carry signed, encrypted ephemeral seat messages over HTTPS WebSockets.
// No WebRTC, TURN credentials, camera, microphone, account, or persistent user profile.
const RELAYS = [
  "wss://nos.lol",
  "wss://relay.novospes.com",
  "wss://relay.grigic.org",
];
export function createPresence({ onChange }) {
  let sockets = [],
    channel,
    roomKey = "",
    config,
    local,
    joined = true,
    generation = 0;
  let started = Date.now(),
    lastSend = 0,
    pendingSend,
    sequence = 0,
    verifying = 0;
  const peers = new Map(),
    sequences = new Map(),
    seenEvents = new Set();
  function emit() {
    const healthy = sockets.some(
      (item) => item.socket?.readyState === 1 && Date.now() - item.ack < 30000,
    );
    const remote = [...peers.entries()].map(([id, value]) => ({
      id,
      ...value.data,
      color: visitorColor(id),
      self: false,
    }));
    const status = !joined
      ? "left"
      : !navigator.onLine
        ? "offline"
        : remote.length && healthy
          ? "connected"
          : !healthy && Date.now() - started > 20000
            ? "unavailable"
            : "waiting";
    onChange({
      status,
      visitors:
        joined && local
          ? [
              { id: selfId, ...local, color: visitorColor(selfId), self: true },
              ...remote,
            ]
          : [],
    });
  }
  async function broadcast(bye = false, transport = { channel, sockets }) {
    if (!transport.channel || !transport.sockets.length) return;
    const seq = ++sequence;
    const event = await transport.channel.encode({ ...local, v: 1, seq, bye });
    const message = JSON.stringify(["EVENT", event]);
    for (const item of transport.sockets)
      if (item.socket?.readyState === 1) item.socket.send(message);
  }
  function send() {
    if (!joined || !channel) return;
    lastSend = Date.now();
    broadcast().catch(() => emit());
  }
  function leave() {
    generation++;
    clearTimeout(pendingSend);
    pendingSend = null;
    const old = { channel, sockets };
    channel = null;
    sockets = [];
    for (const item of old.sockets) {
      item.stopped = true;
      clearTimeout(item.retry);
    }
    // Give an explicit leave a chance to reach peers. Abrupt tab termination uses the expiry instead.
    broadcast(true, old)
      .catch(() => {})
      .finally(() =>
        setTimeout(
          () => old.sockets.forEach((item) => item.socket?.close()),
          180,
        ),
      );
    peers.clear();
    sequences.clear();
    seenEvents.clear();
  }
  async function receive(raw, item, version) {
    if (version !== generation || typeof raw !== "string" || raw.length > 4096)
      return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(message)) return;
    if (message[0] === "OK" && message[2] === true) {
      item.ack = Date.now();
      emit();
      return;
    }
    if (message[0] !== "EVENT" || message[1] !== "cinema" || verifying >= 8)
      return;
    const event = message[2];
    if (
      !event ||
      event.pubkey === selfId ||
      seenEvents.has(event.id) ||
      !channel
    )
      return;
    verifying++;
    const payload = await channel.decode(event).finally(() => verifying--);
    if (
      version !== generation ||
      !payload ||
      !Number.isSafeInteger(payload.seq) ||
      payload.seq <= 0 ||
      payload.seq <= (sequences.get(event.pubkey) || 0)
    )
      return;
    if (!sequences.has(event.pubkey) && sequences.size >= 256) return;
    sequences.set(event.pubkey, payload.seq);
    seenEvents.add(event.id);
    if (seenEvents.size > 512)
      seenEvents.delete(seenEvents.values().next().value);
    if (payload.bye === true) {
      peers.delete(event.pubkey);
      emit();
      return;
    }
    const clean = validateVisitor(payload, config);
    if (!clean || (!peers.has(event.pubkey) && peers.size >= 32)) return;
    const isNew = !peers.has(event.pubkey);
    peers.set(event.pubkey, { data: clean, seen: Date.now() });
    emit();
    if (isNew) {
      clearTimeout(pendingSend);
      pendingSend = setTimeout(send, 200);
    }
  }
  function open(item, version) {
    if (version !== generation || item.stopped || !channel) return;
    const socket = new WebSocket(item.url);
    item.socket = socket;
    socket.onopen = () => {
      if (version !== generation || !channel) {
        socket.close();
        return;
      }
      item.attempt = 0;
      socket.send(
        JSON.stringify([
          "REQ",
          "cinema",
          {
            kinds: [EVENT_KIND],
            "#x": [channel.topic],
            since: Math.floor(Date.now() / 1000) - 10,
          },
        ]),
      );
      send();
    };
    socket.onmessage = (event) => {
      receive(event.data, item, version).catch(() => {});
    };
    socket.onerror = () => {}; // onclose performs bounded backoff; UI shows loss of connectivity.
    socket.onclose = () => {
      item.ack = 0;
      if (version !== generation || item.stopped) return;
      item.retry = setTimeout(
        () => open(item, version),
        Math.min(30000, 1500 * 2 ** Math.min(++item.attempt, 5)) +
          Math.random() * 700,
      );
      emit();
    };
  }
  async function connect() {
    leave();
    started = Date.now();
    if (!joined || !roomKey || !navigator.onLine) {
      emit();
      return;
    }
    const version = generation;
    try {
      const next = await createChannel(roomKey);
      if (version !== generation) return;
      channel = next;
      sockets = RELAYS.map((url) => ({
        url,
        ack: 0,
        attempt: 0,
        stopped: false,
      }));
      for (const item of sockets) open(item, version);
    } catch {
      started = 0;
    }
    emit();
  }
  const timer = setInterval(() => {
    for (const [id, value] of peers)
      if (Date.now() - value.seen > 45000) peers.delete(id);
    if (Date.now() - lastSend >= 10000) send();
    emit();
  }, 5000);
  const onOnline = () => connect();
  const onOffline = () => {
    leave();
    emit();
  };
  const onHide = () => leave();
  const onShow = (event) => {
    if (event.persisted) connect();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("pageshow", onShow);
  return {
    update({ party, room, row, seat, config: nextConfig }) {
      config = nextConfig;
      local = validateVisitor({ v: 1, row, seat }, config);
      const nextKey = `${normalizeParty(party)}:${room}`;
      if (nextKey !== roomKey) {
        roomKey = nextKey;
        connect();
      } else {
        clearTimeout(pendingSend);
        pendingSend = setTimeout(send, 250);
        emit();
      }
    },
    toggle() {
      joined = !joined;
      connect();
      return joined;
    },
    retry() {
      joined = true;
      connect();
    },
    destroy() {
      leave();
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    },
  };
}
