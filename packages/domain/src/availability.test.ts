import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateAvailability, isValidHour, type AvailabilitySlot } from "./availability.js";

function slot(status: AvailabilitySlot["status"]): AvailabilitySlot {
  return { profileId: status, date: "2026-08-04", hour: 12, status };
}

describe("isValidHour", () => {
  it("accepts every boundary hour and rejects invalid values", () => {
    assert.equal(isValidHour(0), true);
    assert.equal(isValidHour(23), true);
    assert.equal(isValidHour(-1), false);
    assert.equal(isValidHour(24), false);
    assert.equal(isValidHour(12.5), false);
  });
});

describe("aggregateAvailability", () => {
  it("returns unknown when there are no participants", () => {
    assert.equal(aggregateAvailability([slot("free")], 0), "unknown");
  });

  it("treats free and stream statuses as available", () => {
    assert.equal(aggregateAvailability([slot("free"), slot("stream"), slot("busy")], 4), "many-free");
    assert.equal(aggregateAvailability([slot("stream"), slot("busy")], 3), "some-free");
  });

  it("applies maybe, busy, and unknown fallbacks in priority order", () => {
    assert.equal(aggregateAvailability([slot("maybe"), slot("busy")], 2), "maybe");
    assert.equal(aggregateAvailability([slot("work"), slot("study")], 2), "busy");
    assert.equal(aggregateAvailability([slot("unknown")], 1), "unknown");
  });
});
