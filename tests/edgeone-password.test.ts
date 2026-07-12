import assert from "node:assert/strict";
import test from "node:test";

let subject: typeof import("../src/lib/auth/edgeone-password-core.ts") | undefined;
try { subject = await import("../src/lib/auth/edgeone-password-core.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("edgeone-password-core must be implemented"); return subject; }

const random = (byte: number) => (length: number) => new Uint8Array(length).fill(byte);

test("usernames normalize and hash to a non-reversible key", () => {
  assert.equal(api().normalizeUsername("  Reader_01 "), "reader_01");
  assert.match(api().hashUsername("reader_01", "p".repeat(32)), /^[a-f0-9]{64}$/);
  assert.doesNotMatch(api().hashUsername("reader_01", "p".repeat(32)), /reader/);
  for (const value of ["ab", "white space", "名字", "a".repeat(33)]) {
    assert.throws(() => api().normalizeUsername(value), { code: "INVALID_USERNAME" });
  }
});

test("password hashes use fixed scrypt parameters and unique salts", async () => {
  const first = await api().hashPassword("correct horse battery staple", random(1));
  const second = await api().hashPassword("correct horse battery staple", random(2));
  assert.notEqual(first.salt, second.salt);
  assert.deepEqual({ ...first, salt: "salt", digest: "digest" }, {
    algorithm: "scrypt", n: 32768, r: 8, p: 1, dkLen: 32, salt: "salt", digest: "digest",
  });
  assert.equal(await api().verifyPassword("correct horse battery staple", first), true);
  assert.equal(await api().verifyPassword("wrong password value", first), false);
});

test("password validation and stored parameters fail closed", async () => {
  for (const value of ["short", "x".repeat(129)]) {
    await assert.rejects(() => api().hashPassword(value, random(1)), { code: "INVALID_PASSWORD" });
  }
  const valid = await api().hashPassword("correct horse battery staple", random(1));
  await assert.rejects(
    () => api().verifyPassword("correct horse battery staple", {
      ...valid,
      n: 2 ** 20,
    } as unknown as typeof valid),
    { code: "INVALID_PASSWORD_HASH" },
  );
});

test("recovery codes contain 256 random bits and only their hash is persisted", () => {
  const code = api().generateRecoveryCode(random(7));
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  const digest = api().hashRecoveryCode(code);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, code);
});
