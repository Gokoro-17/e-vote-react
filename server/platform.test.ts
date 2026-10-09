import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
const { encrypt, decrypt, identityFingerprint } = await import("./platform.js");
const { requirePlatformAdmin } = await import("./auth.js");
test("AES-GCM encrypts separately and rejects tampering", () => {
  const message = "Sensitive evidence and choice";
  const a = encrypt(message),
    b = encrypt(message);
  assert.notEqual(a, b);
  assert.equal(a.includes(message), false);
  assert.equal(decrypt(a).toString(), message);
  const altered = Buffer.from(a, "base64");
  altered[15] ^= 1;
  assert.throws(() => decrypt(altered.toString("base64")));
  assert.throws(() => decrypt(a, "ballot"));
});
test("identity fingerprints are stable keyed pseudonyms", () => {
  assert.equal(
    identityFingerprint("provider-subject-1"),
    identityFingerprint("provider-subject-1"),
  );
  assert.notEqual(
    identityFingerprint("provider-subject-1"),
    identityFingerprint("provider-subject-2"),
  );
  assert.equal(
    identityFingerprint("provider-subject-1").includes("provider-subject"),
    false,
  );
});
test("platform administration requires verified AAL2 authentication", () => {
  const base = {
    user: { id: "admin", role: "SUPER_ADMIN", consentAt: new Date() },
    session: { reauthenticatedAt: new Date() },
    auth: { aal: "aal2" },
    hasVerifiedMfa: true,
    needsMfa: false,
  };
  assert.equal(requirePlatformAdmin(base).id, "admin");
  assert.throws(
    () => requirePlatformAdmin({ ...base, hasVerifiedMfa: false }),
    /Set up an authenticator/,
  );
  assert.throws(
    () => requirePlatformAdmin({ ...base, auth: { aal: "aal1" } }),
    /Verify your authenticator/,
  );
  assert.throws(
    () =>
      requirePlatformAdmin(
        {
          ...base,
          session: { reauthenticatedAt: new Date(Date.now() - 11 * 60000) },
        },
        true,
      ),
    /again before changing platform access/,
  );
});
