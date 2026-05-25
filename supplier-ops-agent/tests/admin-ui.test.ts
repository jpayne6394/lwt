import assert from "node:assert/strict";
import test from "node:test";

import { renderAdminPage } from "../src/server/admin-ui.ts";

test("admin UI renders the required Shopify app sections and run-now control", () => {
  const html = renderAdminPage({
    activePath: "/",
    suppliers: [
      {
        id: "desbio",
        name: "DesBio",
        mode: "website",
        brands: ["DesBio"],
        notes: "Direct supplier portal.",
      },
    ],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
  });

  for (const label of ["Dashboard", "Suppliers", "Runs", "Change Ledger", "Match Issues", "Settings"]) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /Run weekly sync now/);
  assert.match(html, /app-bridge/);
  assert.match(html, /<meta name="shopify-api-key" content="test-api-key">/);
});
