import assert from "node:assert/strict";
import test from "node:test";
import { AlertService } from "../src/alerts/alert-service.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";
import { startServer, type ServerContext } from "../src/server/server.ts";
import { parseSupplierCartPrepareCommand, cartPrepareReceipt, safeCartPrepareReceipt, type SupplierCartPrepareCommand } from "../src/suppliers/cart-preparation.ts";
const token = "p".repeat(48), read = "r".repeat(48), run = "u".repeat(48);
const command: SupplierCartPrepareCommand = { protocolVersion: "supplier_cart_prepare_v1", commandId: "79a6320b-cfc7-458b-ab07-e30805b960a2",
  draftId: "083632d2-92f4-4578-88ca-c3fc7b68e009", fingerprint: "a".repeat(64), supplierKey: "emerson-ecologics",
  items: [{ supplierSku: "DY0007", quantity: 1, packageHint: "300 tablets" }],
  shipping: { name: "Test Recipient", firstName: "Test", lastName: "Recipient", company: "", address1: "1 Example Street", address2: "",
    city: "Richmond", province: "Virginia", postalCode: "23220", country: "US" } };
test("prepare contract requires exact data and rejects caller instructions or payment fields", () => {
  assert.deepEqual(parseSupplierCartPrepareCommand(command), command);
  for (const invalid of [{ ...command, url: "https://evil.test" }, { ...command, pay: true }, { ...command, shipping: { ...command.shipping, firstName: "" } },
    { ...command, items: [...command.items, command.items[0]] }, { ...command, items: [{ ...command.items[0], quantity: 0 }] },
    { ...command, items: [{ ...command.items[0], supplierSku: "<script>" }] }, { ...command, shipping: { ...command.shipping, address1: "bad\nheader" } }]) {
    assert.equal(parseSupplierCartPrepareCommand(invalid), null);
  }
});
test("receipt cannot claim prepared with missing address or incorrect SKU quantities", () => {
  const ready = { ...cartPrepareReceipt(command, "unknown", "outcome_unknown"), status: "prepared", reason: undefined,
    items: [{ supplierSku: "DY0007", quantity: 1 }], shippingApplied: true, shippingMatches: true };
  assert.equal(safeCartPrepareReceipt(ready, command).status, "prepared");
  for (const invalid of [{ ...ready, shippingMatches: false }, { ...ready, items: [] }, { ...ready, orderSubmitted: true },
    { ...ready, items: [{ supplierSku: "DY0001", quantity: 1 }] }, { ...ready, commandId: "wrong" }]) {
    assert.equal(safeCartPrepareReceipt(invalid, command).status, "unknown");
  }
  const projected = safeCartPrepareReceipt({ ...ready, rawAddress: "private", error: "private", remoteCartRef: "https://private.test/token" }, command);
  assert.doesNotMatch(JSON.stringify(projected), /private|https/);
});
async function withServer(overrides: Partial<ServerContext>, use: (base: string) => Promise<void>) {
  const server = startServer({ repository: new MemoryRepository(), suppliers: [], alerts: new AlertService(), runNow: async () => { throw new Error("not permitted"); },
    supplierCartPrepareToken: token, supplierReadToken: read, supplierRunToken: run, ...overrides }, { port: 0, host: "127.0.0.1" });
  await new Promise<void>(resolve => server.once("listening", resolve)); const address = server.address(); assert(address && typeof address === "object");
  try { await use(`http://127.0.0.1:${address.port}`); } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}
const invoke = (base: string, body: unknown, auth = token) => fetch(`${base}/api/suppliers/cart-prepare`, { method: "POST",
  headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: JSON.stringify(body) });
test("only distinct build token can prepare, never catalog READ/RUN/dashboard authority", async () => {
  let calls = 0;
  await withServer({ prepareSupplierCart: async c => { calls++; return cartPrepareReceipt(c, "blocked", "auth_required"); } }, async base => {
    assert.equal((await invoke(base, command, read)).status, 401); assert.equal((await invoke(base, command, run)).status, 401);
    assert.equal((await invoke(base, { ...command, checkout: true })).status, 400); assert.equal(calls, 0);
    const result = await invoke(base, command); assert.equal(result.status, 200); assert.equal((await result.json()).reason, "auth_required"); assert.equal(calls, 1);
  });
  await withServer({ supplierCartPrepareToken: read, prepareSupplierCart: async () => { throw new Error("never"); } }, async base => {
    assert.equal((await invoke(base, command, read)).status, 503);
  });
});
test("duplicate build requests replay one result, changed content never executes", async () => {
  let calls = 0;
  await withServer({ prepareSupplierCart: async c => { calls++; return cartPrepareReceipt(c, "unknown", "outcome_unknown"); } }, async base => {
    const first = await (await invoke(base, command)).json(), second = await (await invoke(base, command)).json();
    assert.deepEqual(first, second); assert.equal(calls, 1);
    const changed = await (await invoke(base, { ...command, items: [{ ...command.items[0], quantity: 2 }] })).json();
    assert.equal(changed.reason, "source_changed"); assert.equal(calls, 1);
  });
});
test("adapter failure produces only an unknown receipt, never provider text or a retry", async () => {
  await withServer({ prepareSupplierCart: async () => { throw new Error("private password customer address"); } }, async base => {
    const result = await (await invoke(base, command)).json();
    assert.equal(result.status, "unknown"); assert.equal(result.orderSubmitted, false); assert.equal(result.paymentSubmitted, false);
    assert.doesNotMatch(JSON.stringify(result), /private|password|customer address/);
  });
});
