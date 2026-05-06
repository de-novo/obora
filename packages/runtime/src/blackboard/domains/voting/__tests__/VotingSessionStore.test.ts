import { describe, expect, it } from "vitest";

import { createAgentId, createAgendaId } from "../../../types";
import { VotingSessionStore } from "../VotingSessionStore";

const agendaId = createAgendaId("agenda-vote");
const creator = createAgentId("agent-creator");
const voterA = createAgentId("agent-a");
const voterB = createAgentId("agent-b");

describe("VotingSessionStore", () => {
  it("opens, closes, deletes, and rejects invalid state transitions", () => {
    const store = new VotingSessionStore();
    const session = store.create({
      agendaId,
      createdBy: creator,
      policy: "majority",
      quorum: 2,
    });

    expect(store.get(session.id)).toBe(session);
    expect(store.getByAgendaId(agendaId)).toEqual([session]);
    expect(store.close(session.id)).toBeUndefined();
    expect(store.open("missing")).toBeUndefined();
    expect(store.open(session.id)?.status).toBe("OPEN");
    expect(store.open(session.id)).toBeUndefined();
    expect(store.close(session.id)?.status).toBe("CLOSED");
    expect(store.addVote({ sessionId: session.id, voterId: voterA, option: "approve" })).toBeNull();
    expect(store.delete(session.id)).toBe(true);
    expect(store.delete(session.id)).toBe(false);
  });

  it("adds and replaces votes while tallying majority and quorum", () => {
    const store = new VotingSessionStore();
    const session = store.create({
      agendaId,
      createdBy: creator,
      policy: "majority",
      quorum: 2,
    });

    expect(store.addVote({ sessionId: session.id, voterId: voterA, option: "approve" })).toBeNull();
    store.open(session.id);
    expect(store.addVote({ sessionId: session.id, voterId: voterA, option: "approve" })).toMatchObject({
      voterId: voterA,
      option: "approve",
    });
    store.addVote({ sessionId: session.id, voterId: voterA, option: "reject" });
    store.addVote({ sessionId: session.id, voterId: voterB, option: "abstain" });

    expect(store.getVotes(session.id).map((vote) => vote.option)).toEqual(["reject", "abstain"]);
    expect(store.getTally(session.id)).toMatchObject({
      totalVotes: 2,
      approves: 0,
      rejects: 1,
      abstains: 1,
      passed: false,
      quorumMet: true,
    });
    expect(store.getTally("missing")).toBeNull();
    expect(store.getVotes("missing")).toEqual([]);
  });

  it("tallies unanimous and weighted voting policies", () => {
    const store = new VotingSessionStore();
    const unanimous = store.create({
      agendaId,
      createdBy: creator,
      policy: "unanimous",
      quorum: 1,
    });
    const weighted = store.create({
      agendaId,
      createdBy: creator,
      policy: "weighted",
      quorum: 1,
    });

    store.open(unanimous.id);
    store.addVote({ sessionId: unanimous.id, voterId: voterA, option: "approve" });
    store.addVote({ sessionId: unanimous.id, voterId: voterB, option: "abstain" });
    expect(store.getTally(unanimous.id)?.passed).toBe(true);

    store.open(weighted.id);
    store.addVote({ sessionId: weighted.id, voterId: voterA, option: "approve", weight: 3 });
    store.addVote({ sessionId: weighted.id, voterId: voterB, option: "reject", weight: 1 });
    expect(store.getTally(weighted.id)).toMatchObject({
      approves: 1,
      rejects: 1,
      passed: true,
      quorumMet: true,
    });
  });
});
