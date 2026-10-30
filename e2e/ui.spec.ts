import { expect, test, type Page } from "@playwright/test";
import { createRoom, hasHorizontalOverflow, joinViaLink, newPlayer, submitWord, wordInput } from "./helpers";

const PHONE = { width: 320, height: 640 };

async function tabUntil(page: Page, accessibleName: RegExp, max = 30) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute("aria-label") ?? el?.textContent ?? "";
    });
    if (accessibleName.test(name.trim())) return;
  }
  throw new Error(`Could not reach ${accessibleName} with the keyboard`);
}

test.describe("layout", () => {
  test("home works at 320px with no horizontal overflow", async ({ browser }) => {
    const page = await newPlayer(browser, { viewport: PHONE, isMobile: true, hasTouch: true });
    await page.goto("/");
    await expect(page.getByRole("img", { name: "Unison" })).toBeVisible();
    await expect(page.getByText("Different minds. One word.")).toBeVisible();
    for (const name of ["Create a room", "Join a room"]) {
      const button = page.getByRole("button", { name });
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("the game screen fits a 320px phone, even with 24-letter words", async ({ browser }) => {
    const a = await newPlayer(browser, { viewport: PHONE, isMobile: true, hasTouch: true });
    const b = await newPlayer(browser, { viewport: PHONE, isMobile: true, hasTouch: true });
    const code = await createRoom(a, "Alexandria Long");
    await joinViaLink(b, code, "Bartholomew");
    expect(await hasHorizontalOverflow(a)).toBe(false);
    await a.getByRole("button", { name: "Start game" }).click();
    await expect(wordInput(a)).toBeVisible();
    // The input is comfortably sized and the page doesn't scroll sideways.
    const inputBox = (await wordInput(a).boundingBox())!;
    expect(inputBox.width).toBeLessThanOrEqual(PHONE.width);
    // ≥16px text keeps iOS Safari from zooming when the field is focused.
    expect(await wordInput(a).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await hasHorizontalOverflow(a)).toBe(false);

    await submitWord(a, "Supercalifragilisticexp");
    await submitWord(b, "Antidisestablishmentari");
    await expect(a.getByRole("region", { name: "Round 1 words" })).toBeVisible();
    expect(await hasHorizontalOverflow(a)).toBe(false);
    expect(await hasHorizontalOverflow(b)).toBe(false);
  });
});

test.describe("interaction", () => {
  test("copying the invite link puts the room URL on the clipboard", async ({ browser, baseURL }) => {
    const page = await newPlayer(browser, { permissions: ["clipboard-read", "clipboard-write"] });
    const code = await createRoom(page, "Copier");
    await page.getByRole("button", { name: "Copy invite link" }).click();
    await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/r/${code}`);
  });

  test("validates words inline before anything is sent", async ({ browser }) => {
    const a = await newPlayer(browser);
    const b = await newPlayer(browser);
    const code = await createRoom(a, "Val");
    await joinViaLink(b, code, "Idator");
    await a.getByRole("button", { name: "Start game" }).click();
    const input = wordInput(a);
    await input.fill("ice cream");
    await expect(a.getByText("Just one word for now.")).toBeVisible();
    await input.fill("hello!");
    await expect(a.getByText("Letters only, please.")).toBeVisible();
    await expect(a.getByRole("button", { name: "Lock in your word" })).toBeDisabled();
    await input.press("Enter");
    await expect(input).toBeVisible();
    await input.fill("hello");
    await expect(a.getByText("Letters only, please.")).toHaveCount(0);
  });

  test("sound can be muted and the preference sticks", async ({ browser }) => {
    const page = await newPlayer(browser);
    await createRoom(page, "Quiet");
    await page.getByRole("button", { name: "Mute sound" }).click();
    await expect(page.getByRole("button", { name: "Unmute sound" })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("unison:sound"))).toBe("off");
    await page.reload();
    await expect(page.getByRole("button", { name: "Unmute sound" })).toBeVisible();
  });

  test("the whole game is playable with the keyboard alone", async ({ browser }) => {
    const page = await newPlayer(browser);
    const friend = await newPlayer(browser);
    await page.goto("/");
    await tabUntil(page, /^Create a room$/);
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Your name")).toBeFocused();
    await page.keyboard.type("Keys");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/r\//);
    const code = page.url().split("/r/")[1];
    await joinViaLink(friend, code, "Board");

    await expect(page.getByText("2 of 4 minds")).toBeVisible();
    await tabUntil(page, /^Start game$/);
    await page.keyboard.press("Enter");

    // The word box takes focus by itself when the round opens.
    await expect(wordInput(page)).toBeFocused();
    await page.keyboard.type("piano");
    await page.keyboard.press("Enter");
    // Focus lands on the confirmation rather than being lost.
    await expect(page.getByRole("heading", { name: "Thought received." })).toBeFocused();

    await submitWord(friend, "piano");
    // When the results settle, focus moves to the next action.
    await expect(page.getByRole("button", { name: "Play again" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("opening-prompt")).toBeVisible();
  });

  test("reduced motion still plays a full game", async ({ browser }) => {
    const a = await newPlayer(browser, { reducedMotion: "reduce" });
    const b = await newPlayer(browser, { reducedMotion: "reduce" });
    const code = await createRoom(a, "Still");
    await joinViaLink(b, code, "Calm");
    await a.getByRole("button", { name: "Start game" }).click();
    await submitWord(a, "quiet");
    await submitWord(b, "quiet");
    for (const page of [a, b]) {
      await expect(page.getByRole("heading", { name: "UNISON." })).toBeVisible();
      await expect(page.getByText("Unison in 1 round")).toBeVisible();
    }
  });
});
