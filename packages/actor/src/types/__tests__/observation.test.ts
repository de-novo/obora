import { describe, it, expect } from "vitest";
import { Observation, createObservation } from "../observation";
import { createActorId } from "../actor";

describe("observation.test.ts", () => {
  describe("createObservation()", () => {
    it("should create observation with required fields", () => {
      const actorId = createActorId("analyst");
      const observation = createObservation({
        actorId,
      });

      expect(observation.actorId).toBe(actorId);
      expect(observation.timestamp).toBeInstanceOf(Date);
    });

    it("should create observation with state", () => {
      const actorId = createActorId("analyst");
      const state = {
        context: { key: "value" },
        agents: [],
        tasks: [],
      };
      const observation = createObservation({
        actorId,
        state,
      });

      expect(observation.state).toEqual(state);
    });

    it("should create observation with knowledge", () => {
      const actorId = createActorId("analyst");
      const knowledge = {
        facts: [{ id: "f1" }],
        inferences: [{ id: "i1" }],
      };
      const observation = createObservation({
        actorId,
        knowledge,
      });

      expect(observation.knowledge).toEqual(knowledge);
    });

    it("should create observation with decisions", () => {
      const actorId = createActorId("analyst");
      const decisions = {
        currentAgenda: null,
        opinions: [{ id: "o1" }],
      };
      const observation = createObservation({
        actorId,
        decisions,
      });

      expect(observation.decisions).toEqual(decisions);
    });

    it("should create observation with all fields", () => {
      const actorId = createActorId("analyst");
      const observation = createObservation({
        actorId,
        state: {
          context: { temperature: 25 },
          agents: [],
          tasks: [],
        },
        knowledge: {
          facts: [{ content: "fact1" }],
          inferences: [{ content: "inference1" }],
        },
        decisions: {
          currentAgenda: { id: "agenda-1" },
          opinions: [],
        },
      });

      expect(observation.actorId).toBe(actorId);
      expect(observation.state).toBeDefined();
      expect(observation.knowledge).toBeDefined();
      expect(observation.decisions).toBeDefined();
    });

    it("should auto-generate timestamp", () => {
      const actorId = createActorId("analyst");
      const before = new Date();
      const observation = createObservation({ actorId });
      const after = new Date();

      expect(observation.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(observation.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("Observation interface", () => {
    it("should accept all optional fields", () => {
      const actorId = createActorId("analyst");
      const observation: Observation = {
        actorId,
        timestamp: new Date(),
      };

      expect(observation).toBeDefined();
      expect(observation.state).toBeUndefined();
      expect(observation.knowledge).toBeUndefined();
      expect(observation.decisions).toBeUndefined();
    });

    it("should allow partial state", () => {
      const actorId = createActorId("analyst");
      const observation: Observation = {
        actorId,
        timestamp: new Date(),
        state: {
          context: { key: "value" },
          agents: [],
          tasks: [],
        },
      };

      expect(observation.state?.context).toEqual({ key: "value" });
    });
  });
});
