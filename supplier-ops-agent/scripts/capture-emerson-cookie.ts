import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const loginUrl = "https://emersonecologics.com/login";
const catalogUrl = "https://www.emersonecologics.com/shop";
const outputPath = path.resolve(process.cwd(), process.argv[2] ?? ".auth/emerson-cookie.env");
const profilePath = path.resolve(process.cwd(), ".auth/emerson-browser");

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(profilePath, { recursive: true });

const context = await chromium.launchPersistentContext(profilePath, {
  channel: "chrome",
  headless: false,
  viewport: { width: 1440, height: 1000 },
});

try {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  const readline = createInterface({ input, output });
  await readline.question(
    "Complete Emerson sign-in in the browser. When the account or catalog is visible, return here and press Enter. ",
  );
  readline.close();

  await page.goto(catalogUrl, { waitUntil: "domcontentloaded" });
  const signInVisible = await page.locator('a[href="/login"]', { hasText: "Sign in" }).count();
  if (signInVisible > 0 || /\/login\/?$/i.test(new URL(page.url()).pathname)) {
    throw new Error("Emerson is not signed in yet. Complete the browser verification and try again.");
  }

  const cookies = await context.cookies(["https://emersonecologics.com", "https://www.emersonecologics.com"]);
  const cookieHeader = cookies
    .filter((cookie) => /(^|\.)emersonecologics\.com$/i.test(cookie.domain))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  if (!cookieHeader) {
    throw new Error("No Emerson session was captured.");
  }

  await writeFile(outputPath, `SUPPLIER_COOKIE_EMERSON_ECOLOGICS=${cookieHeader}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(`Saved the Emerson session to ${outputPath}. The session value was not printed.`);
} finally {
  await context.close();
}
