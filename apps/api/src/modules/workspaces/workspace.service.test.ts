import assert from "node:assert/strict";
import test from "node:test";
import { nextWorkspaceRevision } from "./workspace.service.js";

test("workspace revision starts at one and advances monotonically", () => {
  assert.equal(nextWorkspaceRevision(null), 1);
  assert.equal(nextWorkspaceRevision(1), 2);
  assert.equal(nextWorkspaceRevision(41), 42);
});
