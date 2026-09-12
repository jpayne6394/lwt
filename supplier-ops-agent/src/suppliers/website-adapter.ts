import { normalizeSupplierRecord } from "./normalization.ts";
import { launchSupplierBrowser } from "./browser-launcher.ts";
import type { SupplierAdapter, SupplierAdapterContext, SupplierConfig } from "./types.ts";
import { SupplierAdapterError } from "./types.ts";

export type WebsiteAdapterConfig = {
  loginUrl?: string;
  productsUrl?: string;
  username?: string;
  password?: string;
  selectors?: {
    username: string;
    password: string;
    submit: string;
    productRows?: string;
  };
};

type LoginCheckPhase =
  | "browser_start"
  | "login_page"
  | "username_field"
  | "password_field"
  | "submit"
  | "response_check";

export type LoginOutcome = "connected" | "verification_required" | "two_factor_required" | "login_failed" | "pending";

export function classifyLoginOutcome(pageText: string, passwordFieldCount: number): LoginOutcome {
  const normalizedText = pageText.toLowerCase();
  if (/two-factor|\b2fa\b|verification code|one-time code|security code/.test(normalizedText)) {
    return "two_factor_required";
  }
  if (/complete (the )?captcha|captcha (challenge|required)|verify (that )?you are human|i'm not a robot|unusual traffic/.test(normalizedText)) {
    return "verification_required";
  }
  if (/invalid (email|username|password|credentials)|incorrect (email|password)|sign in failed|login failed/.test(normalizedText)) {
    return "login_failed";
  }
  return passwordFieldCount === 0 ? "connected" : "pending";
}

type LoginStateReader = () => Promise<{ pageText: string; passwordFieldCount: number }>;

export async function waitForLoginOutcome(
  readState: LoginStateReader,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<Exclude<LoginOutcome, "pending"> | "timed_out"> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + timeoutMs;

  while (true) {
    const state = await readState();
    const outcome = classifyLoginOutcome(state.pageText, state.passwordFieldCount);
    if (outcome !== "pending") return outcome;

    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      return /captcha|recaptcha/.test(state.pageText.toLowerCase()) ? "verification_required" : "timed_out";
    }
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

export function loginCheckFailureMessage(supplierName: string, phase: LoginCheckPhase) {
  const phaseLabel: Record<LoginCheckPhase, string> = {
    browser_start: "starting its secure browser",
    login_page: "opening the sign-in page",
    username_field: "locating the email field",
    password_field: "locating the password field",
    submit: "submitting the sign-in form",
    response_check: "checking the sign-in response",
  };
  return `${supplierName} could not complete the sign-in check while ${phaseLabel[phase]}.`;
}

export class WebsiteSupplierAdapter implements SupplierAdapter {
  readonly supplier: SupplierConfig;
  readonly #config: WebsiteAdapterConfig;

  constructor(supplier: SupplierConfig, config: WebsiteAdapterConfig = {}) {
    this.supplier = supplier;
    this.#config = config;
  }

  async fetchProducts(context: SupplierAdapterContext = {}) {
    if (!this.#config.loginUrl || !this.#config.productsUrl || !this.#config.selectors?.productRows) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "not_configured",
        `${this.supplier.name} needs portal URL and selectors before website automation can run`,
      );
    }

    if (!this.#config.username || !this.#config.password) {
      throw new SupplierAdapterError(this.supplier.id, "login_failed", `${this.supplier.name} credentials are missing`);
    }

    const browser = await launchSupplierBrowser();
    try {
      const page = await browser.newPage();
      await page.goto(this.#config.loginUrl, { waitUntil: "networkidle" });
      await page.fill(this.#config.selectors.username, this.#config.username);
      await page.fill(this.#config.selectors.password, this.#config.password);
      await page.click(this.#config.selectors.submit);
      await page.waitForLoadState("networkidle");

      const twoFactorVisible = await page.getByText(/two-factor|2fa|verification code/i).count();
      if (twoFactorVisible > 0) {
        throw new SupplierAdapterError(this.supplier.id, "two_factor_required", `${this.supplier.name} requires 2FA`);
      }

      await page.goto(this.#config.productsUrl, { waitUntil: "networkidle" });
      const records = await page.$$eval(this.#config.selectors.productRows, (rows) =>
        rows.map((row) => {
          const element = row as HTMLElement;
          return {
            title: element.dataset.title ?? element.querySelector("[data-title]")?.textContent ?? "",
            sku: element.dataset.sku ?? element.querySelector("[data-sku]")?.textContent ?? "",
            upc: element.dataset.upc ?? element.querySelector("[data-upc]")?.textContent ?? "",
            brand: element.dataset.brand ?? element.querySelector("[data-brand]")?.textContent ?? "",
            available: element.dataset.available ?? element.querySelector("[data-available]")?.textContent ?? "",
            quantity: element.dataset.quantity ?? element.querySelector("[data-quantity]")?.textContent ?? "",
            cost: element.dataset.cost ?? element.querySelector("[data-cost]")?.textContent ?? "",
            msrp: element.dataset.msrp ?? element.querySelector("[data-msrp]")?.textContent ?? "",
            sale_price: element.dataset.salePrice ?? element.querySelector("[data-sale-price]")?.textContent ?? "",
            url: element.dataset.url ?? "",
            image: element.dataset.image ?? "",
          };
        }),
      );

      const capturedAt = (context.now ?? new Date()).toISOString();
      return records.map((record) =>
        normalizeSupplierRecord({
          supplierId: this.supplier.id,
          supplierName: this.supplier.name,
          record,
          capturedAt,
        }),
      );
    } finally {
      await browser.close();
    }
  }

  async verifyLogin() {
    const config = this.#config;
    if (!config.loginUrl || !config.selectors) {
      return this.#check("not_configured", `${this.supplier.name} needs a portal URL and sign-in selectors.`);
    }
    if (!config.username || !config.password) {
      return this.#check("not_configured", `${this.supplier.name} has no saved account.`);
    }

    let phase: LoginCheckPhase = "browser_start";
    try {
      const browser = await launchSupplierBrowser();
      try {
        const page = await browser.newPage();
        phase = "login_page";
        await page.goto(config.loginUrl, { waitUntil: "domcontentloaded" });
        phase = "username_field";
        await page.fill(config.selectors.username, config.username);
        phase = "password_field";
        await page.fill(config.selectors.password, config.password);
        phase = "submit";
        await page.click(config.selectors.submit);

        phase = "response_check";
        const outcome = await waitForLoginOutcome(async () => ({
          pageText: await page.locator("body").innerText().catch(() => ""),
          passwordFieldCount: await page.locator(config.selectors!.password).count(),
        }));
        if (outcome === "two_factor_required") {
          return this.#check("two_factor_required", `${this.supplier.name} requires a verification step.`);
        }
        if (outcome === "verification_required") {
          return this.#check(
            "verification_required",
            `${this.supplier.name} requires a browser verification step before automated sign-in can continue.`,
          );
        }
        if (outcome === "login_failed") {
          return this.#check("login_failed", `${this.supplier.name} rejected the saved account.`);
        }
        if (outcome === "timed_out") {
          return this.#check("login_failed", `${this.supplier.name} stayed on the sign-in page.`);
        }
        return this.#check("connected", `${this.supplier.name} accepted the saved account.`);
      } finally {
        await browser.close();
      }
    } catch (error) {
      if (error instanceof SupplierAdapterError) throw error;
      console.warn(`[supplier-connection-check] supplier=${this.supplier.id} phase=${phase} result=failed`);
      return this.#check("login_failed", loginCheckFailureMessage(this.supplier.name, phase));
    }
  }

  #check(
    status: "connected" | "verification_required" | "two_factor_required" | "login_failed" | "not_configured",
    message: string,
  ) {
    return { supplierId: this.supplier.id, supplierName: this.supplier.name, status, message } as const;
  }
}

