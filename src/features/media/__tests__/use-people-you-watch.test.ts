import { describe, expect, it } from "vitest";
import { pickTopActor, pickTopDirector } from "../use-people-you-watch";
import { makeMedia } from "@/shared/test-utils";
import type { CastMember, CrewMember, MediaSummary } from "@/types/media";

const castMember = (id: number, name: string): CastMember => ({ id, name, order: 0 });
const director = (id: number, name: string): CrewMember => ({ id, name, job: "Director" });

const titleWith = (
  overrides: Partial<MediaSummary> & { cast?: CastMember[]; directors?: CrewMember[] }
): MediaSummary => makeMedia({ cast: [], ...overrides });

describe("pickTopActor", () => {
  it("returns null below the minimum-titles-for-signal threshold", () => {
    const items = [
      titleWith({ id: 1, cast: [castMember(1, "Zendaya")] }),
      titleWith({ id: 2, cast: [castMember(1, "Zendaya")] }),
    ];
    expect(pickTopActor(items)).toBeNull();
  });

  it("returns null when no single actor recurs across at least 2 titles", () => {
    const items = [
      titleWith({ id: 1, cast: [castMember(1, "Zendaya")] }),
      titleWith({ id: 2, cast: [castMember(2, "Timothée Chalamet")] }),
      titleWith({ id: 3, cast: [castMember(3, "Rebecca Ferguson")] }),
    ];
    expect(pickTopActor(items)).toBeNull();
  });

  it("picks the actor who recurs the most once the thresholds are met", () => {
    const items = [
      titleWith({ id: 1, cast: [castMember(1, "Zendaya"), castMember(2, "Timothée Chalamet")] }),
      titleWith({ id: 2, cast: [castMember(1, "Zendaya")] }),
      titleWith({ id: 3, cast: [castMember(1, "Zendaya"), castMember(3, "Rebecca Ferguson")] }),
    ];
    const top = pickTopActor(items);
    expect(top?.id).toBe(1);
    expect(top?.name).toBe("Zendaya");
    expect(top?.count).toBe(3);
  });

  it("only counts the top-billed slice of a title's cast, not the full list", () => {
    // Six cast members: the 6th (order 5) is outside TOP_BILLED_CAST_SLICE
    // (5) and should never accumulate a count.
    const bitPart = { id: 99, name: "Bit Part", order: 5 };
    const items = [
      titleWith({
        id: 1,
        cast: [
          castMember(1, "A"),
          castMember(2, "B"),
          castMember(3, "C"),
          castMember(4, "D"),
          castMember(5, "E"),
          bitPart,
        ],
      }),
      titleWith({ id: 2, cast: [bitPart] }),
      titleWith({ id: 3, cast: [castMember(1, "A")] }),
    ];
    expect(pickTopActor(items)?.id).not.toBe(99);
  });

  it("breaks a tied count by name for a deterministic pick", () => {
    const items = [
      titleWith({ id: 1, cast: [castMember(2, "Bravo"), castMember(1, "Alpha")] }),
      titleWith({ id: 2, cast: [castMember(2, "Bravo"), castMember(1, "Alpha")] }),
      titleWith({ id: 3, cast: [] }),
    ];
    expect(pickTopActor(items)?.name).toBe("Alpha");
  });
});

describe("pickTopDirector", () => {
  it("treats a missing `directors` field the same as an empty array", () => {
    const items = [titleWith({ id: 1 }), titleWith({ id: 2 }), titleWith({ id: 3 })];
    expect(pickTopDirector(items)).toBeNull();
  });

  it("picks the director credited across the most watched titles", () => {
    const items = [
      titleWith({ id: 1, directors: [director(1, "Denis Villeneuve")] }),
      titleWith({ id: 2, directors: [director(1, "Denis Villeneuve")] }),
      titleWith({ id: 3, directors: [director(2, "Greta Gerwig")] }),
    ];
    const top = pickTopDirector(items);
    expect(top?.id).toBe(1);
    expect(top?.count).toBe(2);
  });
});
