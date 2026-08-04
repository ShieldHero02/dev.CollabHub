import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { overlapsEventWindow, type EventWindow } from "./events.js";

const event = (date: string, startHour: number, endHour: number): EventWindow => ({
  date,
  startHour,
  endHour
});

describe("overlapsEventWindow", () => {
  it("detects partial and contained overlaps symmetrically", () => {
    const outer = event("2026-08-04", 10, 14);
    const partial = event("2026-08-04", 13, 16);
    const inner = event("2026-08-04", 11, 12);

    assert.equal(overlapsEventWindow(outer, partial), true);
    assert.equal(overlapsEventWindow(partial, outer), true);
    assert.equal(overlapsEventWindow(outer, inner), true);
  });

  it("does not treat touching boundaries or different dates as overlaps", () => {
    assert.equal(overlapsEventWindow(event("2026-08-04", 10, 12), event("2026-08-04", 12, 14)), false);
    assert.equal(overlapsEventWindow(event("2026-08-04", 10, 14), event("2026-08-05", 10, 14)), false);
  });
});
