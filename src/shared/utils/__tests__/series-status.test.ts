import { describe, expect, it } from "vitest";
import { isSeriesEnded, progressBarTone } from "../series-status";

describe("isSeriesEnded", () => {
  it("treats Ended and Canceled as ended", () => {
    expect(isSeriesEnded("Ended")).toBe(true);
    expect(isSeriesEnded("Canceled")).toBe(true);
  });

  it("treats every other status, and unknown, as not ended", () => {
    expect(isSeriesEnded("Returning Series")).toBe(false);
    expect(isSeriesEnded("In Production")).toBe(false);
    expect(isSeriesEnded(null)).toBe(false);
    expect(isSeriesEnded(undefined)).toBe(false);
  });
});

describe("progressBarTone", () => {
  it("is inProgress while episodes remain, regardless of status", () => {
    expect(progressBarTone(3, 10, "Ended")).toBe("inProgress");
    expect(progressBarTone(3, 10, "Returning Series")).toBe("inProgress");
  });

  it("is finished once caught up on an ended show", () => {
    expect(progressBarTone(10, 10, "Ended")).toBe("finished");
    expect(progressBarTone(10, 10, "Canceled")).toBe("finished");
  });

  it("is caughtUp once caught up on a show that could still return, or with unknown status", () => {
    expect(progressBarTone(10, 10, "Returning Series")).toBe("caughtUp");
    expect(progressBarTone(10, 10, null)).toBe("caughtUp");
    expect(progressBarTone(10, 10, undefined)).toBe("caughtUp");
  });
});
