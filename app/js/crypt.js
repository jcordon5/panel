// Password-encrypted vault backups (.panelbackup). Web Crypto only, no dependencies.
//
// File layout:  "PANELBK1" | header length (uint32, big endian) | header (JSON) | ciphertext
// The ciphertext is AES-256-GCM of a plain .zip of the vault; the key comes from the password
// with PBKDF2-SHA256. The magic + header are authenticated too (AES-GCM additional data), so
// any change to the file, or a wrong password, makes decryption fail.

const enc = new TextEncoder();
const dec = new TextDecoder();
const MAGIC = enc.encode("PANELBK1");
export const ITERATIONS = 600000;
export const EXT = ".panelbackup";

export class BadPassword extends Error {}
export class NotABackup extends Error {}

const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const newSalt = () => crypto.getRandomValues(new Uint8Array(16));

/** AES-GCM key from a password. A key kept on the device is created with usages ["encrypt"] only. */
export async function deriveKey(password, salt, iterations = ITERATIONS, usages = ["encrypt", "decrypt"]) {
  const base = await crypto.subtle.importKey("raw", enc.encode(String(password).normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, usages);
}

/** Encrypt `plain` (Uint8Array). Pass { password } or a derived { key, salt, iterations }. meta goes in the readable header. */
export async function encryptBackup(plain, { password, key, salt, iterations = ITERATIONS, meta = {} }) {
  if (!key) { salt = newSalt(); key = await deriveKey(password, salt, iterations, ["encrypt"]); }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = enc.encode(JSON.stringify({
    format: "panel-backup", v: 1, ...meta,
    kdf: { name: "PBKDF2-SHA256", iterations, salt: b64(salt) },
    cipher: { name: "AES-256-GCM", iv: b64(iv) },
  }));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, header.length);
  const prefix = concat(MAGIC, len, header);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: prefix }, key, plain));
  return concat(prefix, ct);
}

/** The readable part of a backup (date, app version, number of files…) without the password. */
export function readHeader(bytes) {
  if (bytes.length < 12 || MAGIC.some((b, i) => bytes[i] !== b)) throw new NotABackup("not a Panel backup");
  const n = new DataView(bytes.buffer, bytes.byteOffset + 8, 4).getUint32(0);
  if (12 + n > bytes.length) throw new NotABackup("truncated backup");
  let header;
  try { header = JSON.parse(dec.decode(bytes.subarray(12, 12 + n))); } catch { throw new NotABackup("damaged header"); }
  if (header.v !== 1 || !header.kdf || !header.cipher) throw new NotABackup("unsupported backup version");
  return { header, prefix: bytes.subarray(0, 12 + n), body: bytes.subarray(12 + n) };
}

export async function decryptBackup(bytes, password) {
  const { header, prefix, body } = readHeader(bytes);
  const key = await deriveKey(password, unb64(header.kdf.salt), header.kdf.iterations, ["decrypt"]);
  try {
    return { header, data: new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(header.cipher.iv), additionalData: prefix }, key, body)) };
  } catch {
    throw new BadPassword("wrong password or damaged file");
  }
}
