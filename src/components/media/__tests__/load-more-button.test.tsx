import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { LoadMoreButton } from "../load-more-button";

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

const observers: Array<{ callback: ObserverCallback; observed: Element[]; disconnected: boolean }> = [];

class MockIntersectionObserver {
  private entry: { callback: ObserverCallback; observed: Element[]; disconnected: boolean };

  constructor(callback: ObserverCallback) {
    this.entry = { callback, observed: [], disconnected: false };
    observers.push(this.entry);
  }

  observe(element: Element) {
    this.entry.observed.push(element);
  }

  disconnect() {
    this.entry.disconnected = true;
  }
}

describe("LoadMoreButton", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when there is no next page", () => {
    const { container } = render(<LoadMoreButton hasNextPage={false} isFetchingNextPage={false} onClick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(observers).toHaveLength(0);
  });

  it("fetches on click", () => {
    const onClick = vi.fn();
    render(<LoadMoreButton hasNextPage isFetchingNextPage={false} onClick={onClick} />);

    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("auto-fetches when the sentinel enters the viewport", () => {
    const onClick = vi.fn();
    render(<LoadMoreButton hasNextPage isFetchingNextPage={false} onClick={onClick} />);

    expect(observers).toHaveLength(1);
    observers[0]!.callback([{ isIntersecting: true }]);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not observe while a page is already being fetched", () => {
    render(<LoadMoreButton hasNextPage isFetchingNextPage onClick={() => {}} />);
    expect(observers).toHaveLength(0);
  });

  it("ignores non-intersecting entries", () => {
    const onClick = vi.fn();
    render(<LoadMoreButton hasNextPage isFetchingNextPage={false} onClick={onClick} />);

    observers[0]!.callback([{ isIntersecting: false }]);
    expect(onClick).not.toHaveBeenCalled();
  });
});
