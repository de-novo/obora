import { describe, expect, it } from "vitest";

import { EventBus, type Event } from "../../../events";
import { createAgentId, createAgendaId } from "../../../types";
import {
  AgendaNotFoundError,
  AgendaStore,
  AgendaTransitionError,
  AgendaValidationError,
} from "../AgendaStore";

function collectAgendaEvents(eventBus: EventBus): Event[] {
  const events: Event[] = [];
  eventBus.subscribe("agenda.*", (event) => events.push(event));
  return events;
}

describe("AgendaStore", () => {
  it("creates, lists, reads, updates, transitions, and deletes cloned agendas", () => {
    const eventBus = new EventBus();
    const events = collectAgendaEvents(eventBus);
    const store = new AgendaStore({ eventBus });
    const source = createAgentId("planner");
    const dueAt = new Date("2026-05-10T00:00:00.000Z");

    const created = store.create(
      {
        id: createAgendaId("agenda-1"),
        title: "  Runtime coverage  ",
        description: "  Raise runtime coverage  ",
        priority: 2,
        dueAt,
      },
      source,
    );
    dueAt.setFullYear(2030);
    created.dueAt?.setFullYear(2031);

    expect(store.getById(createAgendaId("agenda-1"))).toMatchObject({
      id: "agenda-1",
      title: "Runtime coverage",
      description: "Raise runtime coverage",
      priority: 2,
      status: "draft",
      dueAt: new Date("2026-05-10T00:00:00.000Z"),
    });

    const updated = store.update(
      createAgendaId("agenda-1"),
      {
        title: " Runtime 85 ",
        description: null,
        priority: 5,
        dueAt: null,
      },
      source,
    );
    expect(updated).toMatchObject({
      title: "Runtime 85",
      description: undefined,
      priority: 5,
      dueAt: undefined,
    });
    expect(store.transition(createAgendaId("agenda-1"), "pending", source).status).toBe("pending");
    expect(store.transition(createAgendaId("agenda-1"), "active", source).status).toBe("active");
    expect(store.list().map((agenda) => agenda.id)).toEqual([createAgendaId("agenda-1")]);
    expect(store.delete(createAgendaId("agenda-1"), source).id).toBe(createAgendaId("agenda-1"));
    expect(() => store.getById(createAgendaId("agenda-1"))).toThrow(AgendaNotFoundError);

    expect(events.map((event) => event.type)).toEqual([
      "agenda.created",
      "agenda.updated",
      "agenda.status.changed",
      "agenda.status.changed",
      "agenda.deleted",
    ]);
  });

  it("preserves existing update fields when patch values are omitted", () => {
    const store = new AgendaStore();
    const id = createAgendaId("agenda-preserve");
    const dueAt = new Date("2026-07-01T00:00:00.000Z");

    store.create({
      id,
      title: "Preserve",
      description: "Keep description",
      priority: 2,
      dueAt,
    });

    const rescheduledDueAt = new Date("2026-07-02T00:00:00.000Z");
    const rescheduled = store.update(id, {
      description: "  Next description  ",
      dueAt: rescheduledDueAt,
    });
    rescheduledDueAt.setUTCFullYear(2030);

    expect(rescheduled).toMatchObject({
      title: "Preserve",
      description: "Next description",
      priority: 2,
      dueAt: new Date("2026-07-02T00:00:00.000Z"),
    });

    const retained = store.update(id, {});
    expect(retained).toMatchObject({
      title: "Preserve",
      description: "Next description",
      priority: 2,
      dueAt: new Date("2026-07-02T00:00:00.000Z"),
    });
    expect(retained.dueAt).not.toBe(rescheduled.dueAt);
  });

  it("emits deep-frozen event payloads with immutable dates", () => {
    const eventBus = new EventBus();
    const events = collectAgendaEvents(eventBus);
    const store = new AgendaStore({ eventBus });

    store.create({
      id: createAgendaId("agenda-freeze"),
      title: "Freeze",
      dueAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    const created = events[0] as Event & {
      payload: {
        agenda: {
          title: string;
          dueAt: Date;
          createdAt: Date;
        };
      };
    };
    expect(Object.isFrozen(created)).toBe(true);
    expect(Object.isFrozen(created.payload)).toBe(true);
    expect(Object.isFrozen(created.payload.agenda)).toBe(true);
    expect(() => {
      created.payload.agenda.createdAt.setTime(0);
    }).toThrow("Agenda event date is immutable");
    expect(() => {
      created.payload.agenda.dueAt.setUTCFullYear(2030);
    }).toThrow("Agenda event date is immutable");
  });

  it("rejects invalid create/update input, duplicates, missing records, and illegal transitions", () => {
    const store = new AgendaStore();

    expect(() => store.create({ id: "" as ReturnType<typeof createAgendaId>, title: "Valid" })).toThrow(
      AgendaValidationError,
    );
    expect(() => store.create({ id: createAgendaId("invalid-title"), title: " " })).toThrow(
      "Agenda title is required",
    );
    expect(() =>
      store.create({ id: createAgendaId("invalid-description"), title: "Valid", description: " " }),
    ).toThrow("Agenda description cannot be empty string");
    expect(() => store.create({ id: createAgendaId("invalid-priority"), title: "Valid", priority: 6 })).toThrow(
      "Agenda priority must be between 1 and 5",
    );
    expect(() =>
      store.create({ id: createAgendaId("invalid-date"), title: "Valid", dueAt: new Date("invalid") }),
    ).toThrow("Agenda dueAt must be a valid Date");

    store.create({ id: createAgendaId("agenda-1"), title: "Valid" });
    expect(() => store.create({ id: createAgendaId("agenda-1"), title: "Duplicate" })).toThrow(
      "Agenda already exists: agenda-1",
    );
    expect(() => store.update(createAgendaId("missing"), { title: "x" })).toThrow(AgendaNotFoundError);
    expect(() => store.update(createAgendaId("agenda-1"), { title: " " })).toThrow("Agenda title cannot be empty");
    expect(() => store.update(createAgendaId("agenda-1"), { description: " " })).toThrow(
      "Agenda description cannot be empty string",
    );
    expect(() => store.update(createAgendaId("agenda-1"), { priority: 0 })).toThrow(
      "Agenda priority must be between 1 and 5",
    );
    expect(() => store.update(createAgendaId("agenda-1"), { dueAt: new Date("invalid") })).toThrow(
      "Agenda dueAt must be a valid Date",
    );
    expect(() => store.transition(createAgendaId("agenda-1"), "completed")).toThrow(AgendaTransitionError);
    expect(() => store.delete(createAgendaId("missing"))).toThrow(AgendaNotFoundError);
  });
});
