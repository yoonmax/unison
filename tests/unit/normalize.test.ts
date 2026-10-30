import { describe, expect, it } from "vitest";
import { isUnison, normalizeAnswer, normalizeNickname } from "@/lib/game/normalize";

describe("normalizeAnswer", () => {
  it.each([
    ["apple", "APPLE"],
    ["Apple", "APPLE"],
    ["APPLE", "APPLE"],
    [" apple ", "APPLE"],
    ["\tocean\n", "OCEAN"],
    // NFKC folds compatibility forms (fullwidth letters) into plain ASCII.
    ["ｏｃｅａｎ", "OCEAN"],
  ])("normalizes %j to %s", (input, expected) => {
    expect(normalizeAnswer(input)).toEqual({ ok: true, word: expected });
  });

  it("makes differently-cased input match", () => {
    const a = normalizeAnswer("apple");
    const b = normalizeAnswer("APPLE");
    const c = normalizeAnswer("Apple");
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["ice cream", "multiple_words"],
    ["two  words", "multiple_words"],
    ["can't", "invalid_chars"],
    ["hello!", "invalid_chars"],
    ["123", "invalid_chars"],
    ["café", "invalid_chars"],
    ["straße", "invalid_chars"],
    ["🙂", "invalid_chars"],
    ["a".repeat(25), "too_long"],
  ])("rejects %j as %s", (input, error) => {
    expect(normalizeAnswer(input)).toEqual({ ok: false, error });
  });

  it("accepts exactly 24 letters", () => {
    expect(normalizeAnswer("a".repeat(24))).toEqual({ ok: true, word: "A".repeat(24) });
  });
});

describe("isUnison", () => {
  it("wins only on exact normalized equality across every participant", () => {
    expect(isUnison(["APPLE", "APPLE", "APPLE"], 3)).toBe(true);
    expect(isUnison(["Apple", "APPLE", "apple"], 3)).toBe(true);
    expect(isUnison(["APPLE", "APPLE", "BANANA"], 3)).toBe(false);
    expect(isUnison(["APPLE", "APPLE", "APPLE", "PEAR"], 4)).toBe(false);
  });

  it("does not treat similar words as matching", () => {
    expect(isUnison(["COLOR", "COLOUR"], 2)).toBe(false);
    expect(isUnison(["SEA", "SEAS"], 2)).toBe(false);
  });

  it("requires an answer from every participant", () => {
    expect(isUnison(["APPLE", "APPLE"], 3)).toBe(false);
  });
});

describe("normalizeNickname", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeNickname("  Mary   Jane ")).toEqual({ ok: true, nickname: "Mary Jane" });
  });

  it("accepts letters from any script, numbers and basic punctuation", () => {
    for (const name of ["Zoë", "José", "李雷", "R2-D2", "Dr. Who?", "O'Neil"]) {
      expect(normalizeNickname(name).ok).toBe(true);
    }
  });

  it.each([
    ["", "empty"],
    ["a".repeat(17), "too_long"],
    ["bad\u0000name", "invalid_chars"],
    ["<script>", "invalid_chars"],
    ["🙂", "invalid_chars"],
  ])("rejects %j as %s", (input, error) => {
    expect(normalizeNickname(input)).toEqual({ ok: false, error });
  });
});
