import { describe, it, expect } from "vitest";

import {
  ActorId,
  ActorRole,
  ActorLifecycleStatus,
  isValidActorId,
  createActorId,
  isValidTransition,
  ActorRoleDescription,
  ActorRoleLevel,
  createTaskId,
  isValidTaskId,
} from "../../actor";
import { createActorMetrics } from "../../metrics";

describe("ActorId", () => {
  it("should validate correct ActorId format", () => {
    const validId = "analyst-550e8400-e29b-41d4-a716-446655440000";
    expect(isValidActorId(validId)).toBe(true);
  });

  it("should reject invalid ActorId formats", () => {
    expect(isValidActorId("invalid")).toBe(false);
    expect(isValidActorId("analyst-123")).toBe(false);
    expect(isValidActorId("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("should create valid ActorId for each role", () => {
    const roles: ActorRole[] = ["analyst", "executor", "verifier", "director"];
    roles.forEach((role) => {
      const id = createActorId(role);
      expect(isValidActorId(id)).toBe(true);
      expect(id.startsWith(role)).toBe(true);
    });
  });
});

describe("ActorLifecycleStatus", () => {
  it("should allow valid transitions", () => {
    expect(isValidTransition(ActorLifecycleStatus.CREATED, ActorLifecycleStatus.STARTING)).toBe(
      true
    );
    expect(isValidTransition(ActorLifecycleStatus.RUNNING, ActorLifecycleStatus.IDLE)).toBe(true);
    expect(isValidTransition(ActorLifecycleStatus.RUNNING, ActorLifecycleStatus.STOPPING)).toBe(
      true
    );
    expect(isValidTransition(ActorLifecycleStatus.RUNNING, ActorLifecycleStatus.RESTARTING)).toBe(
      true
    );
    expect(isValidTransition(ActorLifecycleStatus.IDLE, ActorLifecycleStatus.RESTARTING)).toBe(
      true
    );
    expect(isValidTransition(ActorLifecycleStatus.BUSY, ActorLifecycleStatus.RESTARTING)).toBe(
      true
    );
  });

  it("should reject invalid transitions", () => {
    expect(isValidTransition(ActorLifecycleStatus.CREATED, ActorLifecycleStatus.RUNNING)).toBe(
      false
    );
    expect(isValidTransition(ActorLifecycleStatus.STOPPED, ActorLifecycleStatus.RUNNING)).toBe(
      false
    );
    expect(isValidTransition(ActorLifecycleStatus.RUNNING, ActorLifecycleStatus.CREATED)).toBe(
      false
    );
  });

  it("should handle all status values", () => {
    const statuses = Object.values(ActorLifecycleStatus);
    statuses.forEach((status) => {
      expect(typeof status).toBe("string");
    });
  });
});

describe("ActorMetrics", () => {
  it("should create initial metrics with zeros", () => {
    const metrics = createActorMetrics();
    expect(metrics.totalRuns).toBe(0);
    expect(metrics.successCount).toBe(0);
    expect(metrics.failureCount).toBe(0);
    expect(metrics.lastError).toBeNull();
    expect(metrics.averageExecutionTime).toBe(0);
    expect(metrics.lastExecutionTime).toBeNull();
  });
});

describe("ActorRoleDescription", () => {
  it("should have descriptions for all roles", () => {
    const roles: ActorRole[] = ["analyst", "executor", "verifier", "director"];
    roles.forEach((role) => {
      expect(ActorRoleDescription[role]).toBeDefined();
      expect(typeof ActorRoleDescription[role]).toBe("string");
      expect(ActorRoleDescription[role].length).toBeGreaterThan(0);
    });
  });
});

describe("ActorRoleLevel", () => {
  it("should have levels for all roles", () => {
    const roles: ActorRole[] = ["analyst", "executor", "verifier", "director"];
    roles.forEach((role) => {
      expect(ActorRoleLevel[role]).toBeDefined();
      expect(typeof ActorRoleLevel[role]).toBe("number");
      expect(ActorRoleLevel[role]).toBeGreaterThan(0);
    });
  });

  it("should have director with higher level", () => {
    expect(ActorRoleLevel.director).toBeGreaterThan(ActorRoleLevel.analyst);
    expect(ActorRoleLevel.director).toBeGreaterThan(ActorRoleLevel.executor);
    expect(ActorRoleLevel.director).toBeGreaterThan(ActorRoleLevel.verifier);
  });

  it("should have same levels for analyst, executor, verifier", () => {
    expect(ActorRoleLevel.analyst).toBe(ActorRoleLevel.executor);
    expect(ActorRoleLevel.executor).toBe(ActorRoleLevel.verifier);
  });
});

describe("TaskId", () => {
  it("should validate correct TaskId format", () => {
    expect(isValidTaskId("task-001")).toBe(true);
    expect(isValidTaskId("task-analyze-data")).toBe(true);
    expect(isValidTaskId("task-12345")).toBe(true);
  });

  it("should reject invalid TaskId formats", () => {
    expect(isValidTaskId("task-")).toBe(false);
    expect(isValidTaskId("invalid")).toBe(false);
    expect(isValidTaskId("123")).toBe(false);
    expect(isValidTaskId("")).toBe(false);
  });

  it("should create valid TaskId", () => {
    const taskId = createTaskId("task-001");
    expect(taskId).toBe("task-001");
    expect(isValidTaskId(taskId)).toBe(true);
  });

  it("should throw error when creating TaskId with empty identifier", () => {
    expect(() => createTaskId("task-")).toThrow(
      "TaskId must start with 'task-' followed by an identifier"
    );
  });

  it("should throw error when creating TaskId without prefix", () => {
    expect(() => createTaskId("001")).toThrow(
      "TaskId must start with 'task-' followed by an identifier"
    );
  });
});
