import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const loginUrl = "https://emersonecologics.com/login";
const cookieDomain = "https://www.emersonecologics.com";
const outputPath = path.resolve(process.cwd(), process.argv[2] ?? ".auth/emerson-cookie.env");
const profilePath = path.resolve(process.cwd(), ".auth/emerson-browser");

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(profilePath, { recursive: true });

const context = await chromium.launchPersistentContext(profilePath, {
  headless: false,
  viewport: { width: 1440, height: 1000 },
});

try {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  const readline = createInterface({ input, output });
  await readline.question(
    "Log into Emerson in the browser window. After the catalog/account loads, come back here and press Enter. ",
  );
  readline.close();

  const cookies = await context.cookies(cookieDomain);
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");

  if (!cookieHeader) {
    throw new Error("No Emerson cookies were captured. Make sure the browser is logged into Emerson before pressing Enter.");
  }

  await writeFile(outputPath, `SUPPLIER_COOKIE_EMERSON_ECOLOGICS=${cookieHeader}\n`, { encoding: "utf8" });
  console.log(`Saved Emerson cookie env var to ${outputPath}`);
  console.log("Add that value to Render as SUPPLIER_COOKIE_EMERSON_ECOLOGICS, then redeploy.");
} finally {
  await context.close();
}
