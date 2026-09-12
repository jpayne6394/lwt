import { access, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

const loginUrl = "https://emersonecologics.com/login";
const catalogUrl = "https://emersonecologics.com/shop";
const argumentsList = process.argv.slice(2);
const profileFlagIndex = argumentsList.indexOf("--from-chrome-profile");
const chromeProfile = profileFlagIndex >= 0 ? argumentsList[profileFlagIndex + 1] : undefined;
const outputArgument = argumentsList.find((value, index) => value !== "--from-chrome-profile" && index !== profileFlagIndex + 1);
const outputPath = path.resolve(process.cwd(), outputArgument ?? ".auth/emerson-cookie.env");
const profilePath = path.resolve(process.cwd(), ".auth/emerson-browser");

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(profilePath, { recursive: true });

if (chromeProfile) {
  await captureExistingChromeSession(chromeProfile);
} else {
  await captureInteractiveSession();
}

async function captureInteractiveSession() {
  const context = await chromium.launchPersistentContext(profilePath, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1440, height: 1000 },
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    console.log("Complete the Emerson sign-in in the browser. The session will be captured automatically after the account is verified.");
    const authenticatedPage = await waitForAuthenticatedPage(context);
    await saveVerifiedSession(context, authenticatedPage);
  } finally {
    await context.close();
  }
}

async function captureExistingChromeSession(profileName: string) {
  if (!/^(Default|Profile \d+)$/i.test(profileName)) {
    throw new Error("Chrome profile must be Default or Profile followed by a number.");
  }

  const chromeRoot = path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "User Data");
  const sourceProfile = path.join(chromeRoot, profileName);
  const stagingRoot = path.resolve(process.cwd(), ".auth/emerson-chrome-import");
  const authRoot = path.resolve(process.cwd(), ".auth");
  if (!stagingRoot.startsWith(`${authRoot}${path.sep}`)) {
    throw new Error("Refusing to stage browser data outside the private auth directory.");
  }

  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(path.join(stagingRoot, "Default", "Network"), { recursive: true });
  try {
    await copyFile(path.join(chromeRoot, "Local State"), path.join(stagingRoot, "Local State"));
    await copyFile(path.join(sourceProfile, "Network", "Cookies"), path.join(stagingRoot, "Default", "Network", "Cookies"));
    await copyIfPresent(
      path.join(sourceProfile, "Network", "Cookies-journal"),
      path.join(stagingRoot, "Default", "Network", "Cookies-journal"),
    );

    const context = await chromium.launchPersistentContext(stagingRoot, {
      channel: "chrome",
      headless: true,
      args: ["--profile-directory=Default"],
    });
    try {
      await saveVerifiedSession(context);
    } finally {
      await context.close();
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

async function saveVerifiedSession(context: BrowserContext, page = context.pages()[0]) {
  page ??= await context.newPage();
  await page.goto(catalogUrl, { waitUntil: "domcontentloaded" });
  const accountVisible = await page.locator('[aria-label="Account Dropdown"]').isVisible().catch(() => false);
  if (!accountVisible || (await hasVisibleSignIn(page)) || /\/login\/?$/i.test(new URL(page.url()).pathname)) {
    throw new Error("Emerson is not signed in yet. Complete one browser verification and try again.");
  }

  const cookies = await context.cookies(["https://emersonecologics.com", "https://www.emersonecologics.com"]);
  const cookieHeader = cookies
    .filter((cookie) => /(^|\.)emersonecologics\.com$/i.test(cookie.domain))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  if (!cookieHeader) throw new Error("No Emerson session was captured.");

  await writeFile(outputPath, `SUPPLIER_COOKIE_EMERSON_ECOLOGICS=${cookieHeader}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(`Saved the Emerson session to ${outputPath}. The session value was not printed.`);
}

async function waitForAuthenticatedPage(context: BrowserContext): Promise<Page> {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      if (!/(^|\.)emersonecologics\.com$/i.test(new URL(page.url()).hostname)) continue;
      const accountVisible = await page.locator('[aria-label="Account Dropdown"]').isVisible().catch(() => false);
      if (accountVisible && !(await hasVisibleSignIn(page))) return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Emerson sign-in was not completed within ten minutes.");
}

async function hasVisibleSignIn(page: Page): Promise<boolean> {
  const links = await page.locator('a[href="/login"]', { hasText: "Sign in" }).all();
  return (await Promise.all(links.map((link) => link.isVisible()))).some(Boolean);
}

async function copyIfPresent(source: string, destination: string) {
  try {
    await access(source);
    await copyFile(source, destination);
  } catch {
    // Chrome does not always create a journal when the profile is idle.
  }
}
