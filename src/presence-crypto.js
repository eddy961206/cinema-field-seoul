import { schnorr } from "@noble/secp256k1";
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
const hex = (bytes) =>
  [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const unhex = (value) =>
  Uint8Array.from(value.match(/../g), (n) => parseInt(n, 16));
const hash = (value) => crypto.subtle.digest("SHA-256", encoder.encode(value));
const keypair = schnorr.keygen();
export const selfId = hex(keypair.publicKey);
export const EVENT_KIND = 27235; // NIP-01 ephemeral range; no persisted profile or account.
const eventBytes = (event) =>
  JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);

export async function createChannel(roomKey) {
  const namespace = `cinema-field-seoul:presence:v2:${roomKey}`;
  const topic = hex(await hash(`topic:${namespace}`));
  const key = await crypto.subtle.importKey(
    "raw",
    await hash(`payload:${namespace}`),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  return {
    topic,
    async encode(payload) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoder.encode(JSON.stringify(payload)),
      );
      const content = btoa(
        String.fromCharCode(...iv, ...new Uint8Array(encrypted)),
      );
      const event = {
        pubkey: selfId,
        created_at: Math.floor(Date.now() / 1000),
        kind: EVENT_KIND,
        tags: [["x", topic]],
        content,
      };
      const id = new Uint8Array(await hash(eventBytes(event)));
      return {
        ...event,
        id: hex(id),
        sig: hex(await schnorr.signAsync(id, keypair.secretKey)),
      };
    },
    async decode(event) {
      try {
        if (
          !event ||
          event.kind !== EVENT_KIND ||
          !Number.isInteger(event.created_at) ||
          Math.abs(Date.now() / 1000 - event.created_at) > 50
        )
          return null;
        if (
          !/^[a-f0-9]{64}$/.test(event.id) ||
          !/^[a-f0-9]{64}$/.test(event.pubkey) ||
          !/^[a-f0-9]{128}$/.test(event.sig)
        )
          return null;
        if (
          typeof event.content !== "string" ||
          event.content.length > 1024 ||
          JSON.stringify(event.tags) !== JSON.stringify([["x", topic]])
        )
          return null;
        const id = new Uint8Array(await hash(eventBytes(event)));
        if (
          hex(id) !== event.id ||
          !(await schnorr.verifyAsync(
            unhex(event.sig),
            id,
            unhex(event.pubkey),
          ))
        )
          return null;
        const bytes = Uint8Array.from(atob(event.content), (ch) =>
          ch.charCodeAt(0),
        );
        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: bytes.slice(0, 12) },
          key,
          bytes.slice(12),
        );
        return JSON.parse(decoder.decode(decrypted));
      } catch {
        return null;
      }
    },
  };
}
