import assert from "node:assert/strict";
import test from "node:test";

import { supplierBrowserMode } from "../src/suppliers/browser-launcher.ts";
import {
  classifyLoginOutcome,
  loginCheckFailureMessage,
  waitForLoginOutcome,
} from "../src/suppliers/website-adapter.ts";

test("Render Linux uses the self-contained browser runtime", () => {
  assert.equal(supplierBrowserMode("linux"), "portable");
  assert.equal(supplierBrowserMode("win32"), "managed");
});

test("connection checks expose only a safe failing phase", () => {
  assert.equal(
    loginCheckFailureMessage("Emerson Ecologics", "browser_start"),
    "Emerson Ecologics could not complete the sign-in check while starting its secure browser.",
  );
  assert.equal(
    loginCheckFailureMessage("Emerson Ecologics", "submit"),
    "Emerson Ecologics could not complete the sign-in check while submitting the sign-in form.",
  );
});

test("login classification distinguishes a pending page from verified outcomes", () => {
  assert.equal(classifyLoginOutcome("Sign in to your account", 1), "pending");
  assert.equal(classifyLoginOutcome("Incorrect email or password", 1), "login_failed");
  assert.equal(classifyLoginOutcome("Enter your verification code", 1), "two_factor_required");
  assert.equal(classifyLoginOutcome("This page is protected by reCAPTCHA", 1), "pending");
  assert.equal(classifyLoginOutcome("Verify you are human", 1), "verification_required");
  assert.equal(classifyLoginOutcome("Welcome back", 0), "connected");
});

test("verification challenges take precedence over generic credential errors", () => {
  assert.equal(
    classifyLoginOutcome("Sign in failed. Please complete the CAPTCHA to continue.", 1),
    "verification_required",
  );
});

test("connection checks wait for a delayed successful redirect instead of failing early", async () => {
  const states = [
    { pageText: "Sign in to your account. Protected by reCAPTCHA.", passwordFieldCount: 1 },
    { pageText: "Signing in. Protected by reCAPTCHA.", passwordFieldCount: 1 },
    { pageText: "Welcome back", passwordFieldCount: 0 },
  ];
  let elapsedMs = 0;

  const outcome = await waitForLoginOutcome(
    async () => states.shift() ?? { pageText: "Welcome back", passwordFieldCount: 0 },
    {
      timeoutMs: 5_000,
      pollIntervalMs: 250,
      now: () => elapsedMs,
      sleep: async (milliseconds) => {
        elapsedMs += milliseconds;
      },
    },
  );

  assert.equal(outcome, "connected");
  assert.equal(elapsedMs, 500);
});

test("a reCAPTCHA-protected login that never redirects becomes verification required", async () => {
  let elapsedMs = 0;
  const outcome = await waitForLoginOutcome(
    async () => ({ pageText: "Sign in. This page is protected by reCAPTCHA.", passwordFieldCount: 1 }),
    {
      timeoutMs: 500,
      pollIntervalMs: 250,
      now: () => elapsedMs,
      sleep: async (milliseconds) => {
        elapsedMs += milliseconds;
      },
    },
  );

  assert.equal(outcome, "verification_required");
  assert.equal(elapsedMs, 500);
});
