import { expect, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";

export async function newPlayer(browser: Browser, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext(options);
  return context.newPage();
}

export async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a room" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: /Create room/ }).click();
  await page.waitForURL(/\/r\/[2-9A-HJKMNP-Z]{5}$/);
  await expect(page.getByRole("region", { name: "Lobby" })).toBeVisible();
  return page.url().split("/r/")[1];
}

export async function joinViaLink(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`/r/${code}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: /Join room/ }).click();
  await expect(page.getByRole("region", { name: "Lobby" })).toBeVisible();
}

export async function joinViaCode(page: Page, code: string, name: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Join a room" }).click();
  await page.getByLabel("Room code").fill(code.toLowerCase());
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.waitForURL(new RegExp(`/r/${code}$`));
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: /Join room/ }).click();
  await expect(page.getByRole("region", { name: "Lobby" })).toBeVisible();
}

export function wordInput(page: Page) {
  return page.getByLabel(/Your word for round/);
}

/** Type a word and press Enter (the keyboard path, not the button). */
export async function submitWord(page: Page, word: string): Promise<void> {
  const input = wordInput(page);
  await expect(input).toBeEditable();
  await input.fill(word);
  await input.press("Enter");
  await expect(input).toBeHidden();
}

/** Round one has no given word: everyone sees the same open prompt. */
export async function expectOpeningPrompt(page: Page): Promise<void> {
  await expect(page.getByTestId("opening-prompt")).toHaveText(/Start\s+anywhere\./);
  await expect(page.getByLabel("Your word for round 1")).toBeVisible();
}

/** Everything the page could have learned about the room from the network. */
export function recordApiBodies(page: Page): string[] {
  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (!response.url().includes("/api/") || response.url().endsWith("/stream")) return;
    try {
      bodies.push(await response.text());
    } catch {
      // body unavailable (navigation)
    }
  });
  return bodies;
}

export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}
