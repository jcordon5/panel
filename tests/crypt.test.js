// Encrypted backups and the zip reader/writer. Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";

const crypt = await import("../app/js/crypt.js");
const zip = await import("../app/js/zip.js");
const enc = new TextEncoder(), dec = new TextDecoder();

test("crypt: round trip, header readable without the password, encrypt-only saved key", async () => {
  const plain = enc.encode("# Notas privadas\n".repeat(50));
  const file = await crypt.encryptBackup(plain, { password: "correct horse battery", iterations: 1000, meta: { files: 3, vault: "v" } });
  assert.equal(dec.decode(file.subarray(0, 8)), "PANELBK1");
  assert.ok(!dec.decode(file).includes("Notas privadas"));
  const { header } = crypt.readHeader(file);
  assert.equal(header.files, 3);
  assert.equal(header.kdf.iterations, 1000);
  const out = await crypt.decryptBackup(file, "correct horse battery");
  assert.deepEqual(out.data, plain);
  // a key kept on the device can encrypt, but not decrypt
  const salt = crypt.newSalt();
  const key = await crypt.deriveKey("pw-12345678", salt, 1000, ["encrypt"]);
  const file2 = await crypt.encryptBackup(plain, { key, salt, iterations: 1000 });
  await assert.rejects(crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(12) }, key, file2));
  assert.deepEqual((await crypt.decryptBackup(file2, "pw-12345678")).data, plain);
});

test("crypt: wrong password, tampering and other files are refused", async () => {
  const file = await crypt.encryptBackup(enc.encode("secret"), { password: "pw-12345678", iterations: 1000 });
  await assert.rejects(crypt.decryptBackup(file, "nope-nope"), crypt.BadPassword);
  const tampered = file.slice(); tampered[tampered.length - 1] ^= 1;
  await assert.rejects(crypt.decryptBackup(tampered, "pw-12345678"), crypt.BadPassword);
  // the header is authenticated too: lowering the iterations breaks it
  const n = new DataView(file.buffer).getUint32(8);
  const header = dec.decode(file.subarray(12, 12 + n)).replace('"iterations":1000', '"iterations":1001');
  const forged = new Uint8Array([...file.subarray(0, 12), ...enc.encode(header), ...file.subarray(12 + n)]);
  await assert.rejects(crypt.decryptBackup(forged, "pw-12345678"), crypt.BadPassword);
  assert.throws(() => crypt.readHeader(enc.encode("PK\u0003\u0004 a zip")), crypt.NotABackup);
});

test("zip: compressed writer and reader round trip (text + binary)", async () => {
  const files = [
    { name: "vault/notes/a.md", data: enc.encode("hola ñ\n".repeat(200)) },
    { name: "vault/assets/x.png", data: new Uint8Array([137, 80, 78, 71, 0, 1, 2, 255]) },
  ];
  const bytes = new Uint8Array(await (await zip.makeZipCompressed(files)).arrayBuffer());
  assert.ok(bytes.length < 600, "markdown is compressed");
  const back = await zip.readZip(bytes);
  assert.deepEqual(back.map((f) => f.name), files.map((f) => f.name));
  assert.deepEqual(back[0].data, files[0].data);
  assert.deepEqual(back[1].data, files[1].data);
  const stored = await zip.readZip(new Uint8Array(await zip.makeZip(files).arrayBuffer()));
  assert.deepEqual(stored[1].data, files[1].data);
});
