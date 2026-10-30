import { expect, test } from "@playwright/test";
import { createRoom, joinViaLink, newPlayer, submitWord, wordInput } from "./helpers";

test("refreshing keeps your identity and your locked answer, without leaking others'", async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  const code = await createRoom(a, "Refresher");
  await joinViaLink(b, code, "Steady");
  await a.getByRole("button", { name: "Start game" }).click();
  await submitWord(a, "lighthouse");

  await a.reload();
  await expect(a.getByRole("heading", { name: "Welcome back. Your thought is still here." })).toBeVisible();
  await expect(a.getByText("LIGHTHOUSE", { exact: true })).toBeVisible();
  await expect(a.getByText("2 of 4 minds")).toHaveCount(0);

  await b.reload();
  await expect(wordInput(b)).toBeVisible();
  expect(await b.content()).not.toContain("LIGHTHOUSE");
  expect(await (await b.request.get(`/api/rooms/${code}/state`)).text()).not.toContain("LIGHTHOUSE");
});

test("friendly dead ends: unknown room, full room, match in progress, taken name", async ({ browser }) => {
  const visitor = await newPlayer(browser);
  await visitor.goto("/r/ZZZZZ");
  await expect(visitor.getByRole("heading", { name: "This room has faded away." })).toBeVisible();
  await visitor.getByRole("button", { name: "Back home" }).click();
  await expect(visitor).toHaveURL(/\/$/);

  const host = await newPlayer(browser);
  const code = await createRoom(host, "Host");
  const dup = await newPlayer(browser);
  await dup.goto(`/r/${code}`);
  await dup.getByLabel("Your name").fill("host");
  await dup.getByRole("button", { name: /Join room/ }).click();
  await expect(dup.getByText("Someone here already goes by that name.")).toBeVisible();

  for (const name of ["Two", "Three", "Four"]) await joinViaLink(await newPlayer(browser), code, name);
  const fifth = await newPlayer(browser);
  await fifth.goto(`/r/${code}`);
  await expect(fifth.getByRole("heading", { name: "This room is full." })).toBeVisible();
  await expect(fifth.getByText("Unison is best with up to four minds.")).toBeVisible();

  const small = await createRoom(host, "Host2");
  await joinViaLink(await newPlayer(browser), small, "Pal");
  await host.getByRole("button", { name: "Start game" }).click();
  const late = await newPlayer(browser);
  await late.goto(`/r/${small}`);
  await expect(late.getByRole("heading", { name: "These minds are already syncing." })).toBeVisible();
});

test("a player leaving mid-game ends the match and hands over host", async ({ browser }) => {
  const host = await newPlayer(browser);
  const b = await newPlayer(browser);
  const c = await newPlayer(browser);
  const code = await createRoom(host, "Leaver");
  await joinViaLink(b, code, "Bea");
  await joinViaLink(c, code, "Cal");
  await host.getByRole("button", { name: "Start game" }).click();
  await expect(wordInput(b)).toBeVisible();

  await host.getByRole("button", { name: "Room menu" }).click();
  await host.getByRole("menuitem", { name: "Leave room" }).click();
  await host.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(host).toHaveURL(/\/$/);

  for (const page of [b, c]) {
    await expect(page.getByText("Leaver left, so this game ended. Regroup and go again.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Lobby" })).toBeVisible();
    await expect(page.getByText("2 of 4 minds")).toBeVisible();
  }
  // The longest-present remaining player is the new host and can start again.
  await expect(b.getByRole("button", { name: "Start game" })).toBeEnabled();
  await expect(c.getByText("Waiting for Bea to start the game.")).toBeVisible();
});

test("the host can remove someone from the lobby", async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const code = await createRoom(host, "Boss");
  await joinViaLink(guest, code, "Guest");
  await host.getByRole("button", { name: "Remove Guest" }).click();
  await host.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(host.getByText("1 of 4 minds")).toBeVisible();
  await expect(guest.getByRole("heading", { name: "You were removed from this room." })).toBeVisible();
});

test("the host can end a long game after confirming", async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const code = await createRoom(host, "Ender");
  await joinViaLink(guest, code, "Stayer");
  await host.getByRole("button", { name: "Start game" }).click();
  await expect(wordInput(host)).toBeVisible();
  await host.getByRole("button", { name: "Room menu" }).click();
  await host.getByRole("menuitem", { name: "End game for everyone" }).click();
  await expect(host.getByRole("heading", { name: "End this game for everyone?" })).toBeVisible();
  await host.getByRole("button", { name: "End game", exact: true }).click();
  for (const page of [host, guest]) await expect(page.getByRole("region", { name: "Lobby" })).toBeVisible();
  await expect(guest.getByText("Ender ended the game.")).toBeVisible();
});

test("opening the room in a second tab replaces the first instead of duplicating the player", async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const code = await createRoom(first, "Twin");
  const second = await context.newPage();
  await second.goto(`/r/${code}`);
  await expect(second.getByRole("region", { name: "Lobby" })).toBeVisible();
  await expect(second.getByText("1 of 4 minds")).toBeVisible();
  // The older tab learns on its next heartbeat that it was replaced.
  await expect(first.getByRole("heading", { name: "Unison is open in another tab." })).toBeVisible({ timeout: 20_000 });
  await first.getByRole("button", { name: "Play here instead" }).click();
  await expect(first.getByRole("heading", { name: "Unison is open in another tab." })).toHaveCount(0);
});
