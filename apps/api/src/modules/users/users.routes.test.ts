import assert from "node:assert/strict";
import test from "node:test";
import { canAssignRole, canManageTargetRole } from "./users.routes.js";

test("ordinary user management never assigns or manages master", () => {
  assert.equal(canAssignRole("master", "master"), false);
  assert.equal(canManageTargetRole("master", "master"), false);
});

test("role hierarchy prevents lateral and upward escalation", () => {
  assert.equal(canAssignRole("admin", "head_admin"), false);
  assert.equal(canAssignRole("admin", "admin"), false);
  assert.equal(canAssignRole("admin", "manager"), true);
  assert.equal(canManageTargetRole("admin", "admin"), false);
  assert.equal(canManageTargetRole("admin", "member"), true);
});

test("admin cannot patch display fields of master or head admin", () => {
  assert.equal(canManageTargetRole("admin", "master"), false);
  assert.equal(canManageTargetRole("admin", "head_admin"), false);
});

test("each management role can act only strictly below its hierarchy level", () => {
  assert.equal(canManageTargetRole("master", "head_admin"), true);
  assert.equal(canManageTargetRole("head_admin", "admin"), true);
  assert.equal(canManageTargetRole("head_admin", "head_admin"), false);
  assert.equal(canManageTargetRole("admin", "manager"), true);
  assert.equal(canManageTargetRole("admin", "admin"), false);
  assert.equal(canManageTargetRole("manager", "teamlead"), true);
  assert.equal(canManageTargetRole("manager", "manager"), false);
});

test("role assignment cannot promote laterally, upward, or to master", () => {
  assert.equal(canAssignRole("master", "head_admin"), true);
  assert.equal(canAssignRole("master", "master"), false);
  assert.equal(canAssignRole("head_admin", "admin"), true);
  assert.equal(canAssignRole("head_admin", "head_admin"), false);
  assert.equal(canAssignRole("admin", "head_admin"), false);
  assert.equal(canAssignRole("admin", "admin"), false);
  assert.equal(canAssignRole("admin", "viewer"), true);
});
