import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreateEvent,
  canDeleteEvent,
  canEditEvent,
  canEditParticipant,
  canManageRoles,
  canViewParticipant,
  hasPermission,
  type Actor
} from "./index.js";

const member: Actor = { role: "member", profileId: "member-profile" };
const teamlead: Actor = { role: "teamlead", profileId: "lead-profile", teamIds: ["team-1"] };

describe("role permissions", () => {
  it("grants all permissions to master and limits role management to master", () => {
    const master: Actor = { role: "master", profileId: "master-profile", permissions: [] };
    const customAdmin: Actor = { role: "admin", profileId: "admin-profile", permissions: ["role:manage"] };

    assert.equal(hasPermission(master, "system:manage"), true);
    assert.equal(canManageRoles(master), true);
    assert.equal(canManageRoles(customAdmin), false);
  });

  it("honors explicit permission overrides", () => {
    const restrictedMember: Actor = { ...member, permissions: [] };
    assert.equal(canCreateEvent(member), true);
    assert.equal(canCreateEvent(restrictedMember), false);
  });
});

describe("participant permissions", () => {
  it("allows members to view and edit their own profile only", () => {
    assert.equal(canViewParticipant(member, "member-profile"), true);
    assert.equal(canEditParticipant(member, "member-profile"), true);
    assert.equal(canViewParticipant(member, "other-profile"), false);
    assert.equal(canEditParticipant(member, "other-profile"), false);
  });

  it("allows team leads to view other profiles but follows the default edit permission", () => {
    assert.equal(canViewParticipant(teamlead, "member-profile"), true);
    assert.equal(canEditParticipant(teamlead, "member-profile"), false);
  });

  it("denies unauthenticated actors", () => {
    assert.equal(canViewParticipant(null, "member-profile"), false);
    assert.equal(canEditParticipant(null, "member-profile"), false);
  });
});

describe("event ownership permissions", () => {
  it("allows members to edit and delete their own events", () => {
    assert.equal(canEditEvent(member, "user-1", "user-1"), true);
    assert.equal(canDeleteEvent(member, "user-1", "user-1"), true);
  });

  it("denies members access to events owned by others", () => {
    assert.equal(canEditEvent(member, "user-2", "user-1"), false);
    assert.equal(canDeleteEvent(member, "user-2", "user-1"), false);
  });

  it("allows team leads to manage events owned by others", () => {
    assert.equal(canEditEvent(teamlead, "user-2", "user-1"), true);
    assert.equal(canDeleteEvent(teamlead, "user-2", "user-1"), true);
  });
});
