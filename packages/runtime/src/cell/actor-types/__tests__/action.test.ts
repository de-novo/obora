import { describe, it, expect } from "vitest";

import { taskId } from "../../__tests__/helpers/ids";
import { ActionType, createAction, createActionId, isValidActionId } from "../action";
import { createActorId } from "../actor";

describe("action.test.ts", () => {
  describe("createActionId()", () => {
    it("should create valid ActionId", () => {
      const id = createActionId("action-001");
      expect(id).toBe("action-001");
    });

    it("should throw error when prefix is invalid", () => {
      expect(() => createActionId("invalid-001")).toThrow("ActionId must start with 'action-'");
      expect(() => createActionId("123")).toThrow("ActionId must start with 'action-'");
    });
  });

  describe("isValidActionId()", () => {
    it("should return true for valid ActionId", () => {
      expect(isValidActionId("action-001")).toBe(true);
      expect(isValidActionId("action-123")).toBe(true);
      expect(isValidActionId("action-test")).toBe(true);
    });

    it("should return false for invalid ActionId", () => {
      expect(isValidActionId("invalid-001")).toBe(false);
      expect(isValidActionId("123")).toBe(false);
      expect(isValidActionId("")).toBe(false);
      expect(isValidActionId(null)).toBe(false);
      expect(isValidActionId(undefined)).toBe(false);
      expect(isValidActionId(123)).toBe(false);
    });
  });

  describe("createAction()", () => {
    it("should create action with required fields", () => {
      const actorId = createActorId("analyst");
      const action = createAction(actorId, "analyze");

      expect(action.id).toMatch(
        /^action-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(action.actorId).toBe(actorId);
      expect(action.type).toBe("analyze");
      expect(action.timestamp).toBeInstanceOf(Date);
      expect(isValidActionId(action.id)).toBe(true);
    });

    it("should create action with params", () => {
      const actorId = createActorId("analyst");
      const params = { target: "data-001", method: "read" };
      const action = createAction(actorId, "execute", params);

      expect(action.params).toEqual(params);
    });

    it("should create action with taskId", () => {
      const actorId = createActorId("analyst");
      const id = taskId("task-001");
      const action = createAction(actorId, "verify", undefined, id);

      expect(action.taskId).toBe(id);
    });

    it("should support all action types", () => {
      const actorId = createActorId("analyst");
      const types: ActionType[] = [
        "analyze",
        "execute",
        "verify",
        "coordinate",
        "submit_opinion",
        "submit_vote",
        "create_agenda",
        "unknown",
      ];

      types.forEach((type) => {
        const action = createAction(actorId, type);
        expect(action.type).toBe(type);
      });
    });
  });
});
