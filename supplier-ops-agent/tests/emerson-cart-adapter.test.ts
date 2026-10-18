import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";
import { assertEmersonCartNavigation, emersonCartRequestAllowed, emersonCartItemsMatch, emersonShippingTextMatches, readEmersonCartItems, prepareEmersonCart } from "../src/suppliers/emerson-cart-adapter.ts";
import { EmersonCatalogSupplierAdapter, EmersonSessionExpiredError } from "../src/suppliers/emerson-catalog-adapter.ts";
import { cartPrepareReceipt, type SupplierCartPrepareCommand } from "../src/suppliers/cart-preparation.ts";
import { SupplierAdapterError } from "../src/suppliers/types.ts";

const command: SupplierCartPrepareCommand = { protocolVersion: "supplier_cart_prepare_v1", commandId: "79a6320b-cfc7-458b-ab07-e30805b960a2",
  draftId: "083632d2-92f4-4578-88ca-c3fc7b68e009", fingerprint: "a".repeat(64), supplierKey: "emerson-ecologics",
  items: [{ supplierSku: "DY0007", quantity: 1, packageHint: "300 tablets" }],
  shipping: { name: "Test Recipient", firstName: "Test", lastName: "Recipient", company: "", address1: "1 Example Street", address2: "",
    city: "Richmond", province: "Virginia", postalCode: "23220", country: "US" } };
const supplier = { id: "emerson-ecologics", name: "Emerson Ecologics", mode: "website" as const, brands: [], notes: "" };

test("cart navigation permits observed product/cart/shipping documents but never final checkout or foreign hosts", () => {
  for (const path of ["/shop", "/shop?query=DY0007", "/emerson", "/login", "/products/detail/perfect-amino/DY0007", "/checkout", "/checkout/shipping"]) {
    assert.doesNotThrow(() => assertEmersonCartNavigation(`https://www.emersonecologics.com${path}`));
  }
  for (const url of ["https://foreign.test/checkout", "https://api.emersonecologics.com/checkout", "http://www.emersonecologics.com/shop",
    "https://user:secret@www.emersonecologics.com/shop", "https://www.emersonecologics.com/checkout/payment",
    "https://www.emersonecologics.com/checkout/review", "https://www.emersonecologics.com/account/orders", "https://www.emersonecologics.com/logout"]) {
    assert.throws(() => assertEmersonCartNavigation(url));
  }
});

test("request guard blocks payment/order operations even outside document navigation", () => {
  for (const path of ["/api/orders", "/api/payment", "/checkout/payment", "/checkout/submit", "/place-order", "/submit_order"]) {
    assert.equal(emersonCartRequestAllowed(`https://www.emersonecologics.com${path}`, "POST"), false);
  }
  assert.equal(emersonCartRequestAllowed("https://www.emersonecologics.com/checkout", "POST"), false);
  for (const operation of ["createOrder", "placeOrder", "submitOrder", "completeCheckout", "capturePayment", "orderCreate"]) {
    assert.equal(emersonCartRequestAllowed("https://www.emersonecologics.com/graphql", "POST", JSON.stringify({ operationName: operation })), false);
  }
  assert.equal(emersonCartRequestAllowed("https://www.emersonecologics.com/checkout/shipping", "GET"), true);
  assert.equal(emersonCartRequestAllowed("https://www.emersonecologics.com/graphql", "POST", '{"operationName":"addToCart"}'), true);
});

test("cart equality requires all exact SKU quantities, never extra lines or a related size", () => {
  assert.equal(emersonCartItemsMatch([{ supplierSku: "DY0007", quantity: 1 }], command.items), true);
  for (const actual of [[], [{ supplierSku: "DY0001", quantity: 1 }], [{ supplierSku: "DY0007", quantity: 2 }],
    [{ supplierSku: "DY0007", quantity: 1 }, { supplierSku: "OTHER", quantity: 1 }]]) assert.equal(emersonCartItemsMatch(actual, command.items), false);
});

test("shipping comparison permits punctuation/case formatting but never drops an apartment or changes recipient", () => {
  assert.equal(emersonShippingTextMatches("TEST RECIPIENT 1 Example Street Richmond, VA 23220 United States", command.shipping, "Virginia", "VA"), true);
  assert.equal(emersonShippingTextMatches("Test Recipient 1 Example Street Richmond Virginia 23220", command.shipping, "Virginia"), true);
  for (const changed of ["Test Recipient 1 Example Street Apt 2 Richmond VA 23220", "Other Recipient 1 Example Street Richmond VA 23220",
    "Test Recipient 1 Example Street Richmond VA 23320-1234", "Test Recipient 2 Example Street Richmond VA 23220"]) {
    assert.equal(emersonShippingTextMatches(changed, command.shipping, "Virginia"), false);
  }
  assert.equal(emersonShippingTextMatches("Test Recipient 1 Example Street Richmond VA 23220", { ...command.shipping, address2: "Apt 2" }, "Virginia"), false);
  assert.equal(emersonShippingTextMatches("Test Recipient 1 Example Street Richmond VA 23220-1234", command.shipping, "Virginia", "VA"), true);
  assert.equal(emersonShippingTextMatches("Test Recipient 1 Example Street Richmond VA 23220-9999", { ...command.shipping, postalCode: "23220-1234" }, "Virginia", "VA"), false);
});

function cartPage(rows: Array<{ sku: string; input: string; accessible?: string; href?: string }>): Page {
  return { locator: (selector: string) => {
    assert.equal(selector, 'div[data-e2e$="-wrapper"]');
    return { all: async () => rows.map(row => ({
      getByRole: (role: string, options: { name: string; exact: boolean }) => {
        assert.equal(role, "spinbutton"); assert.equal(options.name, "Item quantity widget");
        return { count: async () => 1, getAttribute: async () => row.accessible ?? row.input };
      },
      locator: (child: string) => child === 'input[data-e2e="product-quantity-input"]'
        ? { inputValue: async () => row.input }
        : { all: async () => [{ getAttribute: async () => row.href ?? `/products/detail/test/${row.sku}` }] },
    })) };
  } } as unknown as Page;
}

test("cart readback uses supplier SKU and both quantity surfaces, not title or URL default size", async () => {
  assert.deepEqual(await readEmersonCartItems(cartPage([{ sku: "DY0007", input: "1" }])), [{ supplierSku: "DY0007", quantity: 1 }]);
  for (const rows of [[{ sku: "DY0007", input: "1", accessible: "2" }], [{ sku: "DY0007", input: "0" }],
    [{ sku: "DY0007", input: "1" }, { sku: "DY0007", input: "1" }],
    [{ sku: "DY0007", input: "1", href: "https://foreign.test/products/detail/test/DY0007" }]]) {
    await assert.rejects(readEmersonCartItems(cartPage(rows)));
  }
});

test("unsupported shipping or supplier never starts a browser", async () => {
  const never = async () => { assert.fail("browser must not launch"); };
  for (const changed of [{ ...command, supplierKey: "other" }, { ...command, shipping: { ...command.shipping, country: "CA" } },
    { ...command, shipping: { ...command.shipping, company: "Required Company" } }]) {
    const result = await prepareEmersonCart(changed, "session=private", { launchBrowser: never });
    assert.equal(result.status, "blocked"); assert.equal(result.orderSubmitted, false); assert.equal(result.paymentSubmitted, false);
  }
});

test("browser launch failure returns only controlled build status", async () => {
  const result = await prepareEmersonCart(command, "session=private", { launchBrowser: async () => { throw new Error("private account password address"); } });
  assert.equal(result.reason, "worker_unavailable"); assert.doesNotMatch(JSON.stringify(result), /private|password|address/);
});

test("positive pre-mutation expiry can renew once, but challenge and unknown cart state cannot", async () => {
  const events: string[] = [];
  const adapter = new EmersonCatalogSupplierAdapter(supplier, { cookieHeader: "session=expired", username: "private", password: "private",
    authenticateSessionImpl: async () => { events.push("renew"); return "session=renewed"; },
    prepareCartImpl: async (c, cookie) => {
      events.push(cookie === "session=expired" ? "closed-expired-browser" : "fresh-preflight");
      if (cookie === "session=expired") throw new EmersonSessionExpiredError(supplier.id);
      return cartPrepareReceipt(c, "blocked", "unexpected_existing_cart");
    } });
  assert.equal((await adapter.prepareCart(command)).reason, "unexpected_existing_cart");
  assert.deepEqual(events, ["closed-expired-browser", "renew", "fresh-preflight"]);
  for (const outcome of ["unknown", "challenge", "mfa"] as const) {
    let calls = 0;
    const noRetry = new EmersonCatalogSupplierAdapter(supplier, { cookieHeader: "session=present", username: "private", password: "private",
      authenticateSessionImpl: async () => { assert.fail("no renewal after cart state uncertainty or challenge"); },
      prepareCartImpl: async c => {
        calls++;
        if (outcome !== "unknown") throw new SupplierAdapterError(supplier.id, outcome === "mfa" ? "two_factor_required" : "verification_required", "private provider text");
        return cartPrepareReceipt(c, "unknown", "outcome_unknown");
      } });
    const result = await noRetry.prepareCart(command);
    assert.equal(result.reason, outcome === "unknown" ? "outcome_unknown" : outcome === "mfa" ? "two_factor_required" : "verification_required");
    assert.equal(calls, 1); assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

/** Unit-only deterministic DOM model of the observed controls; this is not live supplier evidence. */
function providerHarness(options: { existingCart?: boolean; noEmptyProof?: boolean; wrongVariant?: boolean; shippingMismatch?: boolean;
  loseShippingOnReload?: boolean; addFailure?: boolean; challenge?: string; expired?: boolean; existingAddress?: boolean } = {}) {
  const events: string[] = [];
  let url = "about:blank", popover = false, packageOpen = false, sku = "DY0001", quantity = "1", modalOpen = false;
  let billingSame = true, addressSaved = Boolean(options.existingAddress), selected = false, shippingVisits = 0;
  const cart = options.existingCart ? [{ supplierSku: "DY0007", quantity: 1 }] : [] as Array<{ supplierSku: string; quantity: number }>;
  const fields: Record<string, string> = {};
  const route = () => new URL(url).pathname;
  const matches = (name: string | RegExp | undefined, value: string) => name instanceof RegExp ? name.test(value) : name === value;
  const loc = (kind: string, index = 0): any => {
    const isVisible = () => {
      if (kind === "account") return !options.expired;
      if (kind === "signin") return Boolean(options.expired);
      if (kind === "never" || kind === "frames") return false;
      if (kind === "empty") return popover && cart.length === 0 && !options.noEmptyProof;
      if (kind === "modal" || kind.startsWith("field:") || kind === "state" || kind === "country") return modalOpen;
      if (kind === "option") return packageOpen;
      if (kind === "cartrows" || kind === "cartwidget" || kind === "viewcart") return cart.length > 0;
      if (kind === "radio" || kind === "card") return addressSaved;
      return true;
    };
    const self: any = {
      first: () => self,
      filter: (spec: { hasText?: RegExp | string }) => kind === "buttons" ? loc("package") : self,
      isVisible: async () => isVisible(), isEnabled: async () => true, isEditable: async () => true,
      isDisabled: async () => kind === "country", isChecked: async () => kind === "billing" ? billingSame : selected,
      count: async () => kind === "never" ? 0 : kind === "radio" && !addressSaved ? 0 : 1,
      waitFor: async (settings: { state: string }) => {
        if (settings.state === "hidden" ? isVisible() : !isVisible()) throw new Error("control not in required state");
      },
      all: async () => {
        if (kind === "frames" || kind === "never") return [];
        if (kind === "rows") return cart.map((_, i) => loc("row", i));
        if (kind === "radios") return addressSaved ? [loc("radio")] : [];
        if (kind === "ancestors") return [loc("card")];
        return [self];
      },
      innerText: async () => kind === "body" ? options.challenge ?? "Account catalog" : kind === "code" ? sku : kind === "stateoption" ? "Virginia"
        : kind === "recipient" ? "Test Recipient" : kind === "address" ? `${options.shippingMismatch ? "2" : "1"} Example Street - Richmond, Virginia 23220` : "",
      getAttribute: async (attribute: string) => {
        if (kind === "searchlink") return "/products/detail/perfect-amino/DY0001";
        if (kind === "cartlink") return `/products/detail/perfect-amino/${cart[index].supplierSku}`;
        if (kind === "stateoption") return "VA";
        if (attribute === "aria-valuenow") return kind === "cartwidget" ? String(cart[index].quantity) : quantity;
        return null;
      },
      inputValue: async () => kind === "country" ? "United States" : kind === "state" ? "VA"
        : kind === "cartfield" ? String(cart[index].quantity) : kind.startsWith("field:") ? fields[kind.slice(6)] ?? "" : quantity,
      fill: async (value: string) => { if (kind.startsWith("field:")) fields[kind.slice(6)] = value; else quantity = value; },
      blur: async () => undefined,
      selectOption: async (choice: { value: string }) => { assert.equal(choice.value, "VA"); },
      uncheck: async () => { assert.equal(kind, "billing"); billingSame = false; events.push("billing-separated"); },
      check: async () => { assert.equal(kind, "radio"); assert.equal(billingSame, false); selected = true; events.push("select-patient-address"); },
      click: async () => {
        if (kind === "cartbutton") { popover = true; return; }
        if (kind === "package") { packageOpen = true; return; }
        if (kind === "option") { sku = options.wrongVariant ? "DY0001" : "DY0007"; packageOpen = false; return; }
        if (kind === "add") {
          assert.equal(sku, "DY0007", "the default 150-tablet SKU must never be added");
          events.push("add:DY0007"); cart.push({ supplierSku: sku, quantity: Number(quantity) });
          if (options.addFailure) throw new Error("private provider timeout after mutation");
          return;
        }
        if (kind === "patienttab") { assert.equal(billingSame, false); events.push("patient-tab"); return; }
        if (kind === "addaddress") { modalOpen = true; return; }
        if (kind === "closemodal") { modalOpen = false; events.push("close-address-modal"); return; }
        if (kind === "saveaddress") {
          assert.equal(billingSame, false);
          assert.deepEqual(fields, { firstname: "Test", lastname: "Recipient", address1: "1 Example Street", address2: "", city: "Richmond", zipcode: "23220" });
          events.push("save-patient-address"); addressSaved = true; modalOpen = false; return;
        }
        assert.fail(`unexpected action ${kind}`);
      },
      evaluate: async (callback: (element: unknown) => string) => callback({ cloneNode: () => ({
        querySelectorAll: () => [], textContent: `Test Recipient ${options.shippingMismatch ? "2" : "1"} Example Street Richmond VA 23220 United States`,
      }) }),
      locator: (selector: string) => {
        if (selector === "p") return loc("label");
        if (selector === "xpath=following-sibling::p[1]") return loc("code");
        if (selector === "xpath=parent::label") return loc("card");
        if (selector.startsWith("xpath=ancestor::*")) return loc("modal");
        if (selector === 'input[data-testid="aviary-quantity-selector-input"]') return loc("quantityfield");
        if (selector === 'input[data-e2e="product-quantity-input"]') return loc("cartfield", index);
        if (selector === 'a[href*="/products/detail/"]') return loc("cartlink", index);
        if (selector === 'input[type="radio"][name="shipping"]') return loc("radios");
        if (selector === "address h5") return loc("recipient");
        if (selector === "address p") return loc("address");
        if (selector === "input#country") return loc("country");
        if (selector === "select#state") return loc("state");
        if (selector === "option") return loc("stateoption");
        if (selector.startsWith("#")) return loc(`field:${selector.slice(1)}`);
        assert.fail(`unobserved selector ${selector}`);
      },
      getByRole: (role: string, settings: { name?: string | RegExp } = {}) => {
        if (role === "heading") return loc("heading");
        if (role === "spinbutton") return loc(matches(settings.name, "Item quantity widget") ? "cartwidget" : "quantity", index);
        if (role === "button" && settings.name === undefined) return loc("buttons");
        if (matches(settings.name, "Add to cart")) return loc("add");
        if (matches(settings.name, "Save address")) return loc("saveaddress");
        assert.fail(`unexpected role ${role}`);
      },
    };
    return self;
  };
  const page = {
    setDefaultTimeout: () => undefined,
    goto: async (next: string) => {
      url = next; popover = false;
      events.push(`navigate:${route()}`);
      if (route() === "/checkout/shipping" && ++shippingVisits > 1 && options.loseShippingOnReload) selected = false;
    },
    url: () => url,
    locator: (selector: string) => {
      if (selector === "body") return loc("body");
      if (selector === '[aria-label="Account Dropdown"]') return loc("account");
      if (selector === 'a[href="/login"]') return loc("signin");
      if (selector.startsWith("iframe")) return loc("frames");
      if (selector === 'a[data-testid="go-to-pdp"]') return loc("searchlink");
      if (selector === '[data-testid="aviary-columns"]') return loc("primary");
      if (selector === 'div[data-e2e$="-wrapper"]') return loc("rows");
      if (selector === 'input[type="radio"][name="shipping"]') return loc("radios");
      if (selector === '#panel-patient-addresses[role="tabpanel"]') return loc("panel");
      if (selector === "#firstname") return loc("field:firstname");
      assert.fail(`unobserved page selector ${selector}`);
    },
    frameLocator: () => ({ getByRole: () => loc("never") }),
    getByText: (text: string) => loc(text === "Your cart is empty" ? "empty" : "label"),
    getByRole: (role: string, settings: { name?: string | RegExp } = {}) => {
      if (role === "heading") return loc("heading");
      if (matches(settings.name, "Toggle profile account settings")) return loc("never");
      if (role === "button" && matches(settings.name, `Cart (${cart.reduce((sum, row) => sum + row.quantity, 0)})`)) return loc("cartbutton");
      if (role === "menuitemradio" && matches(settings.name, "300 tablets")) return loc("option");
      if (role === "spinbutton") return loc("cartwidget");
      if (role === "link" && matches(settings.name, "View cart")) return loc("viewcart");
      if (role === "checkbox") return loc("billing");
      if (role === "tab" && matches(settings.name, "Patient addresses")) return loc("patienttab");
      if (role === "button" && matches(settings.name, "Add new patient address")) return loc("addaddress");
      if (role === "button" && matches(settings.name, "Close modal")) return loc("closemodal");
      if (role === "button" && matches(settings.name, "Add to cart")) return loc("add");
      return loc("never");
    },
  };
  const browser = { newContext: async (settings: unknown) => {
    assert.deepEqual(settings, { serviceWorkers: "block" }, "supplier requests must not evade the build-only route guard through a service worker");
    return { addCookies: async () => undefined, route: async () => undefined, newPage: async () => page };
  },
    close: async () => { events.push("closed"); } } as unknown as Browser;
  return { events, launch: async () => browser };
}

test("provider unit path proves exact variant/quantity and saved customer shipping after full reloads", async () => {
  const harness = providerHarness();
  const result = await prepareEmersonCart(command, "session=private", { launchBrowser: harness.launch });
  assert.equal(result.status, "prepared"); assert.deepEqual(result.items, [{ supplierSku: "DY0007", quantity: 1 }]);
  assert.equal(result.shippingApplied, true); assert.equal(result.shippingMatches, true);
  assert.equal(result.orderSubmitted, false); assert.equal(result.paymentSubmitted, false);
  assert.equal(harness.events.filter(event => event === "add:DY0007").length, 1);
  assert.equal(harness.events.filter(event => event === "navigate:/checkout/shipping").length, 2);
  assert.equal(harness.events.at(-1), "closed");
  assert.doesNotMatch(JSON.stringify(result), /Example|Recipient|private|payment\//);
});

test("an already saved exact customer address is reused without creating a duplicate", async () => {
  const harness = providerHarness({ existingAddress: true });
  const result = await prepareEmersonCart(command, "session=private", { launchBrowser: harness.launch });
  assert.equal(result.status, "prepared");
  assert.equal(harness.events.includes("save-patient-address"), false);
  assert.equal(harness.events.filter(event => event === "select-patient-address").length, 1);
});

test("province-code fallback reuses the exact saved address only after reading its actual state option", async () => {
  const harness = providerHarness({ existingAddress: true });
  const result = await prepareEmersonCart({ ...command, shipping: { ...command.shipping, province: "VA" } }, "session=private", { launchBrowser: harness.launch });
  assert.equal(result.status, "prepared");
  assert.equal(harness.events.includes("save-patient-address"), false);
  assert.equal(harness.events.includes("close-address-modal"), true);
});

test("existing or unproven empty cart cannot be adopted, cleared or changed", async () => {
  for (const options of [{ existingCart: true }, { noEmptyProof: true }]) {
    const harness = providerHarness(options);
    const result = await prepareEmersonCart(command, "session=private", { launchBrowser: harness.launch });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, options.existingCart ? "unexpected_existing_cart" : "cart_not_verified");
    assert.equal(harness.events.some(event => /add:|save-|select-/.test(event)), false);
    assert.equal(harness.events.at(-1), "closed");
  }
});

test("wrong variant stops before Add, while uncertain mutation or lost shipping never claims prepared", async () => {
  for (const options of [{ wrongVariant: true }, { addFailure: true }, { shippingMismatch: true }, { loseShippingOnReload: true }]) {
    const harness = providerHarness(options);
    const result = await prepareEmersonCart(command, "session=private", { launchBrowser: harness.launch });
    assert.equal(result.status, options.wrongVariant ? "blocked" : "unknown");
    if (options.wrongVariant) assert.equal(harness.events.includes("add:DY0007"), false);
    else assert.equal(harness.events.filter(event => event === "add:DY0007").length, 1);
    assert.equal(result.shippingMatches, false); assert.equal(result.paymentSubmitted, false); assert.equal(result.orderSubmitted, false);
    assert.equal(harness.events.at(-1), "closed");
  }
});

test("positive expiry closes browser before renewal signal; visible challenge never signals retry", async () => {
  const expired = providerHarness({ expired: true });
  await assert.rejects(prepareEmersonCart(command, "session=private", { launchBrowser: expired.launch }), EmersonSessionExpiredError);
  assert.equal(expired.events.at(-1), "closed");
  for (const challenge of ["Enter verification code", "Verify you are human"]) {
    const harness = providerHarness({ challenge });
    const result = await prepareEmersonCart(command, "session=private", { launchBrowser: harness.launch });
    assert.equal(result.reason, challenge.startsWith("Enter") ? "two_factor_required" : "verification_required");
    assert.equal(harness.events.includes("add:DY0007"), false); assert.equal(harness.events.at(-1), "closed");
  }
});
