import type { Browser, Locator, Page } from "playwright";
import { launchSupplierBrowser } from "./browser-launcher.ts";
import { cartPrepareReceipt, type SupplierCartPrepareCommand, type SupplierCartPrepareReceipt, type SupplierCartPrepareReason } from "./cart-preparation.ts";
import { activeEmersonChallenge, createEmersonAccountVerifier, EmersonSessionExpiredError, emersonSessionCookies } from "./emerson-catalog-adapter.ts";
import { SupplierAdapterError } from "./types.ts";

const SUPPLIER = "emerson-ecologics";
const ORIGIN = "https://www.emersonecologics.com";
type CartItem = { supplierSku: string; quantity: number };
class CartStop extends Error {
  readonly reason: SupplierCartPrepareReason;
  constructor(reason: SupplierCartPrepareReason) { super(reason); this.reason = reason; }
}
const visible = (locator: Locator) => locator.isVisible().catch(() => false);

async function assertBuildPage(page: Page) {
  assertEmersonCartNavigation(page.url());
  const challenge = await activeEmersonChallenge(page);
  if (challenge) throw new CartStop(challenge);
  if (/^\/login\/?$/.test(new URL(page.url()).pathname)) throw new CartStop("auth_required");
}

async function navigate(page: Page, href: string) {
  assertEmersonCartNavigation(href);
  await page.goto(href, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await assertBuildPage(page);
}

export function emersonCartItemsMatch(actual: CartItem[], wanted: CartItem[]): boolean {
  return actual.length === wanted.length && wanted.every((item) => actual.some((row) => row.supplierSku === item.supplierSku && row.quantity === item.quantity));
}

/** Exact search may point to a parent product; its default SKU is never accepted as the requested variant. */
async function openExactEmersonProduct(page: Page, item: SupplierCartPrepareCommand["items"][number]): Promise<Locator> {
  const search = new URL(`${ORIGIN}/shop`);
  search.searchParams.set("query", `"${item.supplierSku}"`);
  await navigate(page, search.toString());
  const links = page.locator('a[data-testid="go-to-pdp"]');
  await links.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
  const hrefs = new Set<string>();
  for (const link of await links.all()) {
    if (!(await visible(link))) continue;
    const href = await link.getAttribute("href");
    if (!href) continue;
    const url = new URL(href, ORIGIN);
    assertEmersonCartNavigation(url.toString());
    if (!url.pathname.startsWith("/products/detail/")) throw new CartStop("item_not_found");
    hrefs.add(url.toString());
  }
  if (hrefs.size !== 1) throw new CartStop("item_not_found");
  await navigate(page, [...hrefs][0]);
  const columns = page.locator('[data-testid="aviary-columns"]').filter({ has: page.getByText("Item Code", { exact: true }) })
    .filter({ has: page.getByRole("heading") }).filter({ has: page.getByRole("button", { name: "Add to cart", exact: true }) });
  await columns.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
  const primaryCandidates: Locator[] = [];
  for (const column of await columns.all()) {
    if (await visible(column) && await column.getByRole("button", { name: "Add to cart", exact: true }).count() === 1) primaryCandidates.push(column);
  }
  if (primaryCandidates.length !== 1) throw new CartStop("variant_mismatch");
  const primary = primaryCandidates[0];
  const code = primary.locator('p').filter({ hasText: /^Item Code$/ }).locator('xpath=following-sibling::p[1]');
  const readCode = () => code.innerText({ timeout: 5_000 }).then(value => value.trim());
  if (await readCode() !== item.supplierSku) {
    if (!item.packageHint.trim()) throw new CartStop("variant_mismatch");
    const packages = primary.getByRole("button").filter({ hasText: /^\d+(?:[.,]\d+)?\s*[A-Za-z][A-Za-z\s.-]*$/ });
    const packageButtons: Locator[] = [];
    for (const button of await packages.all()) if (await visible(button)) packageButtons.push(button);
    if (packageButtons.length !== 1) throw new CartStop("variant_mismatch");
    await assertBuildPage(page);
    await packageButtons[0].click({ timeout: 5_000 });
    const option = page.getByRole("menuitemradio", { name: item.packageHint, exact: true });
    if (await option.count() !== 1 || !(await visible(option))) throw new CartStop("variant_mismatch");
    await option.click({ timeout: 5_000 });
    // React updates the item code without changing the parent URL.
    await code.filter({ hasText: new RegExp(`^${item.supplierSku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
      .waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  }
  if (await readCode() !== item.supplierSku) throw new CartStop("variant_mismatch");
  return primary;
}

async function addExactEmersonItem(page: Page, item: SupplierCartPrepareCommand["items"][number], expectedTotal: number, beforeMutation: () => void) {
  const primary = await openExactEmersonProduct(page, item);
  const quantity = primary.getByRole("spinbutton", { name: "Quantity selector", exact: true });
  const field = primary.locator('input[data-testid="aviary-quantity-selector-input"]');
  if (await quantity.count() !== 1 || await field.count() !== 1) throw new CartStop("quantity_unavailable");
  if (Number(await field.inputValue()) !== item.quantity) {
    if (!(await visible(field)) || !(await field.isEditable().catch(() => false))) throw new CartStop("quantity_unavailable");
    await field.fill(String(item.quantity), { timeout: 5_000 });
    await field.blur({ timeout: 5_000 });
  }
  if (Number(await field.inputValue()) !== item.quantity || Number(await quantity.getAttribute("aria-valuenow")) !== item.quantity) throw new CartStop("quantity_unavailable");
  const add = primary.getByRole("button", { name: "Add to cart", exact: true });
  if (!(await visible(add)) || !(await add.isEnabled().catch(() => false))) throw new CartStop("quantity_unavailable");
  await assertBuildPage(page);
  beforeMutation(); // Timeout after this point cannot safely be retried, even if the response was lost.
  await add.click({ timeout: 10_000, noWaitAfter: true });
  await page.getByRole("button", { name: new RegExp(`^Cart\\s*\\(${expectedTotal}\\)$`) })
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("link", { name: "View cart", exact: true }).waitFor({ state: "visible", timeout: 5_000 });
  if (!(await add.isEnabled().catch(() => false))) throw new CartStop("cart_not_verified");
}

const addressText = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]/gu, "");

/** Formatting alone may differ; no omitted apartment, changed street, or inferred recipient is accepted. */
export function emersonShippingTextMatches(value: string, shipping: SupplierCartPrepareCommand["shipping"], stateLabel: string, stateCode = shipping.province): boolean {
  const prefix = [shipping.firstName, shipping.lastName, shipping.address1, shipping.address2, shipping.city];
  const actual = addressText(value);
  return [shipping.province, stateLabel, stateCode].some(state => ["", "United States"].some(country => {
    const beforePostal = addressText([...prefix, state].join(" ")), postal = addressText(shipping.postalCode), suffix = addressText(country);
    if (actual === `${beforePostal}${postal}${suffix}`) return true;
    // Supplier address validation may enrich a source ZIP5 with its ZIP+4; never replace a source ZIP+4 or ZIP5.
    return /^\d{5}$/.test(shipping.postalCode) && new RegExp(`^${beforePostal}${postal}\\d{4}${suffix}$`, "u").test(actual);
  }));
}

async function matchingShippingRadio(page: Page, shipping: SupplierCartPrepareCommand["shipping"], state: { label: string; value: string }, allowMissing = false): Promise<Locator | undefined> {
  const matching: Locator[] = [];
  const panel = page.locator('#panel-patient-addresses[role="tabpanel"]');
  for (const radio of await panel.locator('input[type="radio"][name="shipping"]').all()) {
    const label = radio.locator("xpath=parent::label");
    if (await label.count() !== 1 || await label.locator("address h5").count() !== 1 || await label.locator("address p").count() !== 1) continue;
    const recipient = await label.locator("address h5").innerText(), address = await label.locator("address p").innerText();
    if (addressText(recipient) === addressText(`${shipping.firstName} ${shipping.lastName}`)
      && emersonShippingTextMatches(`${recipient} ${address}`, shipping, state.label, state.value)) matching.push(radio);
  }
  if (!matching.length && allowMissing) return undefined;
  if (matching.length !== 1) throw new CartStop("shipping_mismatch");
  return matching[0];
}

async function applyEmersonShipping(page: Page, shipping: SupplierCartPrepareCommand["shipping"], beforeMutation: () => void): Promise<{ label: string; value: string }> {
  await navigate(page, `${ORIGIN}/checkout/shipping`);
  const billingSame = page.getByRole("checkbox", { name: "Shipping & billing address are the same", exact: true });
  await billingSame.waitFor({ state: "visible", timeout: 20_000 });
  await assertBuildPage(page);
  beforeMutation();
  await billingSame.uncheck({ timeout: 5_000 });
  if (await billingSame.isChecked()) throw new CartStop("shipping_mismatch");
  await page.getByRole("tab", { name: "Patient addresses", exact: true }).click({ timeout: 5_000 });
  const sourceState = { label: shipping.province, value: shipping.province };
  const existing = await matchingShippingRadio(page, shipping, sourceState, true);
  if (existing) {
    await assertBuildPage(page);
    if (!(await existing.isChecked())) { beforeMutation(); await existing.check({ timeout: 5_000 }); }
    if (!(await existing.isChecked()) || await billingSame.isChecked()) throw new CartStop("shipping_mismatch");
    return sourceState;
  }
  await page.getByRole("button", { name: "Add new patient address", exact: true }).click({ timeout: 5_000 });
  const firstName = page.locator("#firstname");
  await firstName.waitFor({ state: "visible", timeout: 5_000 });
  const modal = firstName.locator('xpath=ancestor::*[.//input[@id="lastname"] and .//button[normalize-space(.)="Save address"]][1]');
  if (await modal.count() !== 1) throw new CartStop("shipping_unavailable");
  const country = modal.locator("input#country");
  if (!(await country.isDisabled()) || await country.inputValue() !== "United States") throw new CartStop("shipping_unavailable");
  const state = modal.locator("select#state"), candidates: Array<{ value: string; label: string }> = [];
  for (const option of await state.locator("option").all()) {
    const value = await option.getAttribute("value") ?? "", label = (await option.innerText()).trim();
    if (addressText(value) === addressText(shipping.province) || addressText(label) === addressText(shipping.province)) candidates.push({ value, label });
  }
  if (candidates.length !== 1) throw new CartStop("shipping_unavailable");
  // If Shopify supplied a province code, the observed selector supplies its exact full name before reuse.
  const mappedExisting = await matchingShippingRadio(page, shipping, candidates[0], true);
  if (mappedExisting) {
    await page.getByRole("button", { name: "Close modal", exact: true }).click({ timeout: 5_000 });
    await modal.waitFor({ state: "hidden", timeout: 5_000 });
    await assertBuildPage(page);
    if (await billingSame.isChecked()) throw new CartStop("shipping_mismatch");
    if (!(await mappedExisting.isChecked())) { beforeMutation(); await mappedExisting.check({ timeout: 5_000 }); }
    if (!(await mappedExisting.isChecked()) || await billingSame.isChecked()) throw new CartStop("shipping_mismatch");
    return candidates[0];
  }
  const fields = { firstname: shipping.firstName, lastname: shipping.lastName, address1: shipping.address1,
    address2: shipping.address2, city: shipping.city, zipcode: shipping.postalCode };
  for (const [id, value] of Object.entries(fields)) {
    const field = modal.locator(`#${id}`);
    if (!(await visible(field)) || !(await field.isEditable())) throw new CartStop("shipping_unavailable");
    await field.fill(value, { timeout: 5_000 });
    if (await field.inputValue() !== value) throw new CartStop("shipping_mismatch");
  }
  await state.selectOption({ value: candidates[0].value }, { timeout: 5_000 });
  if (await state.inputValue() !== candidates[0].value || await billingSame.isChecked()) throw new CartStop("shipping_mismatch");
  await assertBuildPage(page);
  beforeMutation();
  await modal.getByRole("button", { name: "Save address", exact: true }).click({ timeout: 10_000, noWaitAfter: true });
  await modal.waitFor({ state: "hidden", timeout: 20_000 });
  await assertBuildPage(page);
  const radio = await matchingShippingRadio(page, shipping, candidates[0]);
  if (!radio) throw new CartStop("shipping_mismatch");
  if (!(await radio.isChecked())) {
    if (await billingSame.isChecked()) throw new CartStop("shipping_mismatch");
    beforeMutation();
    await radio.check({ timeout: 5_000 });
  }
  if (!(await radio.isChecked()) || await billingSame.isChecked()) throw new CartStop("shipping_mismatch");
  return candidates[0];
}

/** Only observed catalog/cart/shipping documents; no payment, order, or account-administration navigation. */
export function assertEmersonCartNavigation(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || !["emersonecologics.com", "www.emersonecologics.com"].includes(url.hostname)
    || !(/^\/(?:shop|emerson|login)?\/?$/.test(url.pathname) || /^\/products\/detail\//.test(url.pathname)
      || /^\/checkout(?:\/shipping)?\/?$/.test(url.pathname))) throw new CartStop("cart_not_verified");
}

/** Defense in depth against final financial actions, including recognizable GraphQL mutations. */
export function emersonCartRequestAllowed(urlValue: string, method: string, body = ""): boolean {
  let url: URL;
  try { url = new URL(urlValue); } catch { return false; }
  if (!/^https?:$/.test(url.protocol) || /\/(?:payments?|pay|place[-_]?order|submit[-_]?order|complete[-_]?checkout|orders?)(?:\/|$)/i.test(url.pathname)
    || /^\/checkout\/(?:payment|review|confirm|complete|submit)(?:\/|$)/i.test(url.pathname)) return false;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    if (/^\/checkout\/?$/i.test(url.pathname)
      || /(?:place|submit|create|complete|capture|charge|refund|authorize)[A-Za-z_]*(?:Order|Payment|Checkout)|(?:Order|Payment)(?:Create|Submit|Place|Capture|Charge|Refund)/i.test(body)) return false;
  }
  return true;
}

export async function readEmersonCartItems(page: Page): Promise<CartItem[]> {
  const items: CartItem[] = [];
  const rows = await page.locator('div[data-e2e$="-wrapper"]').all();
  for (const row of rows) {
    const quantity = row.getByRole("spinbutton", { name: "Item quantity widget", exact: true });
    if (!(await quantity.count())) continue;
    const skus = new Set<string>();
    for (const link of await row.locator('a[href*="/products/detail/"]').all()) {
      const href = await link.getAttribute("href");
      if (!href) continue;
      const url = new URL(href, ORIGIN);
      assertEmersonCartNavigation(url.toString());
      skus.add(decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? ""));
    }
    const field = row.locator('input[data-e2e="product-quantity-input"]');
    const value = await field.inputValue({ timeout: 5_000 });
    const count = Number(value), accessibleCount = Number(await quantity.getAttribute("aria-valuenow"));
    if (skus.size !== 1 || !Number.isSafeInteger(count) || count < 1 || count !== accessibleCount) throw new CartStop("cart_not_verified");
    items.push({ supplierSku: [...skus][0], quantity: count });
  }
  if (new Set(items.map((item) => item.supplierSku)).size !== items.length) throw new CartStop("cart_not_verified");
  return items;
}

/** One browser lease. Positive session expiry is thrown only before any supplier mutation and after close. */
export async function prepareEmersonCart(command: SupplierCartPrepareCommand, cookie: string, options: {
  launchBrowser?: () => Promise<Browser>;
} = {}): Promise<SupplierCartPrepareReceipt> {
  if (command.supplierKey !== SUPPLIER) return cartPrepareReceipt(command, "blocked", "unsupported_supplier");
  if (command.shipping.country !== "US" || command.shipping.company.trim()) return cartPrepareReceipt(command, "blocked", "shipping_unavailable");
  let browser: Browser;
  try { browser = await (options.launchBrowser ?? launchSupplierBrowser)(); }
  catch { return cartPrepareReceipt(command, "blocked", "worker_unavailable"); }
  let mutated = false;
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.addCookies(emersonSessionCookies(cookie));
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (request.isNavigationRequest() && request.frame().parentFrame() === null) {
        try { assertEmersonCartNavigation(request.url()); } catch { return route.abort("blockedbyclient"); }
      }
      if (!emersonCartRequestAllowed(request.url(), request.method(), request.postData() ?? "")) return route.abort("blockedbyclient");
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    await page.goto(`${ORIGIN}/shop`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    assertEmersonCartNavigation(page.url());
    await Promise.any([
      page.locator('[aria-label="Account Dropdown"]').first().waitFor({ state: "visible", timeout: 20_000 }),
      page.getByRole("button", { name: "Toggle profile account settings", exact: true }).waitFor({ state: "visible", timeout: 20_000 }),
      page.locator('a[href="/login"]').filter({ hasText: /^Sign in$/i }).first().waitFor({ state: "visible", timeout: 20_000 }),
    ]).catch(() => undefined);
    if (!(await createEmersonAccountVerifier(page, SUPPLIER)())) {
      if (/^\/login\/?$/.test(new URL(page.url()).pathname)
        || await page.locator('a[href="/login"]').filter({ hasText: /^Sign in$/i }).isVisible().catch(() => false)) throw new EmersonSessionExpiredError(SUPPLIER);
      throw new CartStop("auth_required");
    }
    if (await page.getByRole("button", { name: /^Cart\s*\([1-9][0-9]*\)$/ }).isVisible().catch(() => false)) throw new CartStop("unexpected_existing_cart");
    const emptyCart = page.getByRole("button", { name: /^Cart\s*\(0\)$/ });
    if (!(await emptyCart.isVisible().catch(() => false))) throw new CartStop("cart_not_verified");
    await emptyCart.click({ timeout: 5_000 });
    if (!(await page.getByText("Your cart is empty", { exact: true }).isVisible().catch(() => false))) throw new CartStop("cart_not_verified");
    const added: CartItem[] = [];
    for (const item of command.items) {
      await addExactEmersonItem(page, item, added.reduce((sum, row) => sum + row.quantity, item.quantity), () => { mutated = true; });
      added.push({ supplierSku: item.supplierSku, quantity: item.quantity });
      await navigate(page, `${ORIGIN}/checkout`);
      await page.getByRole("spinbutton", { name: "Item quantity widget", exact: true }).first()
        .waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
      if (!emersonCartItemsMatch(await readEmersonCartItems(page), added)) throw new CartStop("cart_not_verified");
    }
    const state = await applyEmersonShipping(page, command.shipping, () => { mutated = true; });
    // Full document reloads prove provider-side persistence, not optimistic local form state.
    await navigate(page, `${ORIGIN}/checkout`);
    await page.getByRole("spinbutton", { name: "Item quantity widget", exact: true }).first()
      .waitFor({ state: "visible", timeout: 20_000 });
    const finalItems = await readEmersonCartItems(page);
    if (!emersonCartItemsMatch(finalItems, command.items)) throw new CartStop("cart_not_verified");
    await navigate(page, `${ORIGIN}/checkout/shipping`);
    const billingSame = page.getByRole("checkbox", { name: "Shipping & billing address are the same", exact: true });
    await billingSame.waitFor({ state: "visible", timeout: 20_000 });
    if (await billingSame.isChecked()) throw new CartStop("shipping_mismatch");
    await page.getByRole("tab", { name: "Patient addresses", exact: true }).click({ timeout: 5_000 });
    const selected = await matchingShippingRadio(page, command.shipping, state);
    if (!selected || !(await selected.isChecked())) throw new CartStop("shipping_mismatch");
    await assertBuildPage(page);
    return { protocolVersion: command.protocolVersion, commandId: command.commandId, draftId: command.draftId,
      fingerprint: command.fingerprint, supplierKey: command.supplierKey, status: "prepared", verifiedAt: new Date().toISOString(),
      items: finalItems, shippingApplied: true, shippingMatches: true, orderSubmitted: false, paymentSubmitted: false };
  } catch (error) {
    if (!mutated && error instanceof EmersonSessionExpiredError) throw error;
    const reason = error instanceof CartStop ? error.reason : error instanceof SupplierAdapterError && error.kind === "two_factor_required"
      ? "two_factor_required" : error instanceof SupplierAdapterError && error.kind === "verification_required" ? "verification_required" : "cart_not_verified";
    if (mutated) return cartPrepareReceipt(command, "unknown", error instanceof CartStop || error instanceof SupplierAdapterError ? reason : "outcome_unknown");
    return cartPrepareReceipt(command, "blocked", reason);
  } finally { await browser.close().catch(() => undefined); }
}
