import { describe, expect, it } from "vitest";
import { normalizeTitle } from "../text";

describe("normalizeTitle", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeTitle("Marvel's Daredevil")).toBe("marvel s daredevil");
  });

  it("strips diacritics", () => {
    expect(normalizeTitle("Café Society")).toBe("cafe society");
  });

  it("strips a leading 'the' or 'a'/'an'", () => {
    expect(normalizeTitle("The Wire")).toBe("wire");
    expect(normalizeTitle("A Star Is Born")).toBe("star is born");
    expect(normalizeTitle("An American Werewolf in London")).toBe("american werewolf in london");
  });

  it("treats different-cased and differently-punctuated versions of the same title as equal", () => {
    expect(normalizeTitle("CAFE SOCIETY")).toBe(normalizeTitle("Café, Society!"));
  });
});
