import assert from "node:assert/strict";
import test from "node:test";

import { defaultFeedUrlForSupplier } from "../src/suppliers/factory.ts";

test("defaultFeedUrlForSupplier uses public feeds for supported supplier sites", () => {
  assert.equal(
    defaultFeedUrlForSupplier("physicians-standard"),
    "https://www.physiciansstandard.com/products.json?limit=250",
  );
  assert.equal(
    defaultFeedUrlForSupplier("desbio"),
    "https://desbio.com/wp-json/wc/store/v1/products?per_page=100",
  );
  assert.equal(
    defaultFeedUrlForSupplier("research-nutritionals"),
    "https://www.researchednutritionals.com/wp-json/wc/store/v1/products?per_page=100",
  );
});
