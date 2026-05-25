import assert from "node:assert/strict";
import test from "node:test";

import { AlertService } from "../src/alerts/alert-service.ts";
import { CredentialVault } from "../src/security/credential-vault.ts";

test("credential vault encrypts and decrypts supplier portal credentials", () => {
  const vault = new CredentialVault("0123456789abcdef0123456789abcdef");
  const encrypted = vault.encrypt({ username: "supplier@example.com", password: "secret" });

  assert.notEqual(encrypted.ciphertext.includes("secret"), true);
  assert.deepEqual(vault.decrypt(encrypted), {
    username: "supplier@example.com",
    password: "secret",
  });
});

test("alert service records in-app alerts and sends email for operational failures", async () => {
  const sentEmails: Array<{ subject: string; body: string }> = [];
  const alerts = new AlertService({
    sendEmail: async (message) => {
      sentEmails.push(message);
    },
  });

  await alerts.raise({
    severity: "error",
    kind: "supplier_login_failed",
    title: "DesBio login failed",
    body: "The supplier portal requires manual attention.",
    email: true,
  });

  assert.equal(alerts.list().length, 1);
  assert.deepEqual(sentEmails, [
    {
      subject: "[Supplier Ops] DesBio login failed",
      body: "The supplier portal requires manual attention.",
    },
  ]);
});

test("alert service keeps repeated operational alerts deduplicated", async () => {
  const alerts = new AlertService();
  const input = {
    severity: "error" as const,
    kind: "supplier_sync_failed",
    title: "World Health Mall sync failed",
    body: "World Health Mall needs portal URL and selectors before website automation can run",
    email: false,
  };

  await alerts.raise(input);
  await alerts.raise(input);

  assert.equal(alerts.list().length, 1);
});
