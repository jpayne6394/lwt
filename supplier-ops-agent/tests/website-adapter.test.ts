import assert from "node:assert/strict";
import test from "node:test";

import { supplierBrowserMode } from "../src/suppliers/browser-launcher.ts";
import { loginCheckFailureMessage } from "../src/suppliers/website-adapter.ts";

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
