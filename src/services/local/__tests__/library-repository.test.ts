import { beforeEach, describe, expect, it } from "vitest";
import { libraryRepository } from "../library-repository";
import { makeMedia } from "./test-utils";

describe("libraryRepository (browser fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a new entry defaulting to the planned status", async () => {
    const item = await libraryRepository.upsert(makeMedia({ id: 7 }));
    expect(item.status).toBe("planned");
    expect(item.favourite).toBe(false);

    const fetched = await libraryRepository.get(7, "movie");
    expect(fetched?.mediaId).toBe(7);
  });

  it("sets completedAt when the status transitions to completed", async () => {
    await libraryRepository.upsert(makeMedia({ id: 7 }));
    const updated = await libraryRepository.upsert(makeMedia({ id: 7 }), { status: "completed" });

    expect(updated.status).toBe("completed");
    expect(updated.completedAt).not.toBeNull();
  });

  it("preserves user fields across updates that omit them", async () => {
    await libraryRepository.upsert(makeMedia({ id: 7 }), { userRating: 8, tags: ["favourite-director"] });
    const updated = await libraryRepository.upsert(makeMedia({ id: 7 }), { status: "watching" });

    expect(updated.userRating).toBe(8);
    expect(updated.tags).toEqual(["favourite-director"]);
  });

  it("removes an entry", async () => {
    await libraryRepository.upsert(makeMedia({ id: 7 }));
    await libraryRepository.remove(7, "movie");
    expect(await libraryRepository.get(7, "movie")).toBeNull();
  });
});
