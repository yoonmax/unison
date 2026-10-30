import { expect, test } from "@playwright/test";
import {
  createRoom,
  joinViaCode,
  joinViaLink,
  newPlayer,
  recordApiBodies,
  startingWord,
  submitWord,
  wordInput,
} from "./helpers";

// The acceptance scenario: three separate browser contexts (separate cookies,
// separate sessions) play a full match against the real server and database.
test("three players converge on one word, then play again", async ({ browser }) => {
  const alex = await newPlayer(browser);
  const jamie = await newPlayer(browser);
  const sam = await newPlayer(browser);
  const jamieSaw = recordApiBodies(jamie);

  // 1–3. Create, join by link, join by code.
  const code = await createRoom(alex, "Alex");
  await joinViaLink(jamie, code, "Jamie");
  await joinViaCode(sam, code, "Sam");
  for (const page of [alex, jamie, sam]) {
    await expect(page.getByText("3 of 4 minds")).toBeVisible();
  }

  // Only the host gets a start button.
  await expect(jamie.getByRole("button", { name: /Start game/ })).toHaveCount(0);

  // 4–5. Host starts; everyone sees the same starting word.
  await alex.getByRole("button", { name: "Start game" }).click();
  const words = await Promise.all([alex, jamie, sam].map(startingWord));
  expect(new Set(words).size).toBe(1);
  expect(words[0]).toMatch(/^[A-Z]+$/);

  // 6. Alex locks in BEACH and sees their own private confirmation.
  await submitWord(alex, "beach");
  await expect(alex.getByText("Thought received.")).toBeVisible();
  // (filter: the home page's demo, kept alive by the router in a hidden
  // Activity, happens to contain BEACH too.)
  await expect(alex.getByText("BEACH", { exact: true }).filter({ visible: true })).toBeVisible();

  // 7. Jamie can't read BEACH: not on screen, not in the authorized state API,
  //    not in the history API, not in anything the browser received so far.
  await expect(jamie.getByText("Alex: Ready")).toBeVisible();
  const state = await jamie.request.get(`/api/rooms/${code}/state`);
  expect(state.ok()).toBe(true);
  expect(await state.text()).not.toContain("BEACH");
  expect(await (await jamie.request.get(`/api/rooms/${code}/history`)).text()).not.toContain("BEACH");
  expect(await jamie.content()).not.toContain("BEACH");
  expect(jamieSaw.join("\n")).not.toContain("BEACH");

  // 8–9. The others answer.
  await submitWord(jamie, "Water");
  await submitWord(sam, "OCEAN");

  // 10. Everyone sees the same simultaneous reveal.
  for (const page of [alex, jamie, sam]) {
    const reveal = page.getByRole("region", { name: "Round 1 words" });
    await expect(reveal).toBeVisible();
    for (const word of ["BEACH", "WATER", "OCEAN"]) {
      await expect(reveal.getByText(word, { exact: true })).toBeVisible();
    }
  }

  // 11. Round 2 opens for everyone after the synchronized reveal window.
  for (const page of [alex, jamie, sam]) {
    await expect(wordInput(page)).toBeVisible();
    await expect(page.getByLabel("Your word for round 2")).toBeVisible();
  }

  // 12. All three converge on SEA.
  await Promise.all([submitWord(alex, "sea"), submitWord(jamie, "Sea"), submitWord(sam, "SEA")]);

  // 13–14. Everyone sees the same victory, word and round count.
  for (const page of [alex, jamie, sam]) {
    const victory = page.getByRole("region", { name: "Unison achieved" });
    await expect(victory.getByRole("heading", { name: "UNISON." })).toBeVisible();
    await expect(victory.getByText("Unison in 2 rounds")).toBeVisible();
    await expect(victory.getByText("3 minds. 1 word.")).toBeVisible();
    await expect(victory.locator("dd").first()).toHaveText("SEA");
  }

  // Round history shows how the words evolved.
  await jamie.getByRole("button", { name: "Round history" }).last().click();
  await expect(jamie.getByText("Round 2").last()).toBeVisible();

  // 15. The host starts another match in the same room.
  await expect(jamie.getByRole("button", { name: "Play again" })).toHaveCount(0);
  await alex.getByRole("button", { name: "Play again" }).click();
  for (const page of [alex, jamie, sam]) {
    await expect(page.getByTestId("starting-word")).toBeVisible();
    await expect(page.getByLabel("Your word for round 1")).toBeVisible();
  }
});
