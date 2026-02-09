import { describe, it, expect, beforeEach } from "vitest";
import { SupervisorTree } from "../SupervisorTree";
import type { ActorRuntime } from "../../runtime/ActorRuntime";

class MockRuntime {
  async restart() {}
  async stop() {}
  getActor() {
    return { id: "test", role: "analyst", status: "running" };
  }
}

describe("SupervisorTree", () => {
  let tree: SupervisorTree;
  let runtime: MockRuntime;

  beforeEach(() => {
    runtime = new MockRuntime();
    tree = new SupervisorTree(runtime as unknown as ActorRuntime);
  });

  describe("createRoot", () => {
    it("should create root supervisor", () => {
      const rootId = tree.createRoot();
      expect(rootId).toBeDefined();
      expect(tree.getRoot()).not.toBeNull();
    });

    it("should throw when creating second root", () => {
      tree.createRoot();
      expect(() => tree.createRoot()).toThrow("Root supervisor already exists");
    });
  });

  describe("createChild", () => {
    it("should create child supervisor", () => {
      const rootId = tree.createRoot();
      const childId = tree.createChild(rootId);
      expect(childId).toBeDefined();
      expect(tree.getSupervisor(childId)).toBeDefined();
    });

    it("should throw when parent not found", () => {
      expect(() => tree.createChild("non-existent")).toThrow("Parent supervisor not found");
    });

    it("should create nested children", () => {
      const rootId = tree.createRoot();
      const child1Id = tree.createChild(rootId);
      const child2Id = tree.createChild(child1Id);
      expect(tree.getSupervisor(child2Id)).toBeDefined();
    });
  });

  describe("remove", () => {
    it("should remove supervisor", () => {
      const rootId = tree.createRoot();
      const childId = tree.createChild(rootId);
      tree.remove(childId);
      expect(() => tree.getSupervisor(childId)).toThrow("Supervisor not found");
    });

    it("should remove children when removing parent", () => {
      const rootId = tree.createRoot();
      const child1Id = tree.createChild(rootId);
      const child2Id = tree.createChild(child1Id);
      tree.remove(child1Id);
      expect(() => tree.getSupervisor(child1Id)).toThrow();
      expect(() => tree.getSupervisor(child2Id)).toThrow();
    });
  });

  describe("shutdown", () => {
    it("should shutdown entire tree", () => {
      const rootId = tree.createRoot();
      tree.createChild(rootId);
      tree.createChild(rootId);
      tree.shutdown();
      expect(tree.getRoot()).toBeNull();
    });
  });

  describe("printTree", () => {
    it("should print empty tree", () => {
      expect(tree.printTree()).toBe("(empty tree)");
    });

    it("should print tree structure", () => {
      const rootId = tree.createRoot();
      tree.createChild(rootId);
      tree.createChild(rootId);
      const output = tree.printTree();
      expect(output).toContain("[");
    });
  });
});
