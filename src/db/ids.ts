// Row ids are UUIDs generated on the device.

export function newId(): string {
  return crypto.randomUUID();
}

// Fixed namespace for name-based ids (random, generated once for this app).
const NAMESPACE = 'b9f4c1de-6a0e-4c52-9f3a-2d7e8c5a1f60';

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  return Uint8Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

function bytesToUuid(b: Uint8Array): string {
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * RFC 4122 v5 (SHA-1, name-based) UUID. The same parts always give the same id, on
 * every device. Used for "one row per user per date" tables (bodyweights,
 * daily_briefs) so two offline devices logging the same day update one row
 * instead of colliding on the (user_id, date) unique constraint.
 */
export async function deterministicId(...parts: string[]): Promise<string> {
  const name = new TextEncoder().encode(parts.join('|'));
  const ns = uuidToBytes(NAMESPACE);
  const input = new Uint8Array(ns.length + name.length);
  input.set(ns);
  input.set(name, ns.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).slice(0, 16);
  hash[6] = (hash[6]! & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8]! & 0x3f) | 0x80; // RFC 4122 variant
  return bytesToUuid(hash);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
