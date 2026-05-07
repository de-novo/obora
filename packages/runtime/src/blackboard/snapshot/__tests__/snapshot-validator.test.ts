import { describe, expect, it } from "vitest";
import { calculateChecksumSync } from "../serializer";
import { SnapshotValidator } from "../snapshot-validator";
import { compress } from "../compression";
import { SNAPSHOT_FORMAT_VERSION } from "../types";
import { createSessionId } from "../../types";
import { isSerializedState } from "../type-guards";
import type { SerializedState, Snapshot } from "../types";

interface SnapshotValidatorHarness {
  validateRuntimeStructure(snapshot: Snapshot): {
    valid: boolean;
    errors: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
  };
}

const timestamp = "2026-01-01T00:00:00.000Z";
const sessionId = createSessionId("session-1");

function createSerializedState(overrides: Partial<SerializedState> = {}): SerializedState {
  const base: SerializedState = {
    meta: {
      version: 1,
      lastUpdated: timestamp,
      sessionId,
      createdAt: timestamp,
    },
    state: {
      phase: "idle",
      context: {},
      agents: [],
      tasks: [],
    },
    knowledge: {
      facts: [],
      inferences: [],
      patterns: [],
    },
    decisions: {
      current: null,
      pending: [],
      opinions: [],
      history: [],
      voting: {},
    },
  };

  return {
    ...base,
    ...overrides,
    meta: { ...base.meta, ...overrides.meta },
    state: { ...base.state, ...overrides.state },
    knowledge: { ...base.knowledge, ...overrides.knowledge },
    decisions: { ...base.decisions, ...overrides.decisions },
  };
}

function createSnapshot(
  data = createSerializedState(),
  meta: Partial<Snapshot["meta"]> = {}
): Snapshot {
  return {
    meta: {
      id: "snapshot-1",
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      createdAt: new Date(timestamp),
      sessionId,
      stateVersion: 1,
      checksum: calculateChecksumSync(data),
      compressed: false,
      originalSize: JSON.stringify(data).length,
      ...meta,
    },
    data,
  };
}

describe("SnapshotValidator", () => {
  it("validates snapshots with sync and async checksum checks", async () => {
    const validator = new SnapshotValidator();
    const snapshot = createSnapshot();

    expect(validator.validateSync(snapshot)).toEqual({ valid: true, errors: [], warnings: [] });
    await expect(validator.validate(snapshot)).resolves.toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it("reports basic format, metadata, checksum, and version errors", () => {
    const validator = new SnapshotValidator();

    expect(validator.validateSync({} as unknown as Snapshot).errors[0]).toMatchObject({
      code: "FORMAT_INVALID",
    });
    expect(
      validator.validateSync(createSnapshot(undefined, { checksum: "" })).errors[0]
    ).toMatchObject({
      code: "MISSING_FIELD",
    });
    expect(validator.validateSync(createSnapshot(undefined, { checksum: "bad" })).errors[0]).toMatchObject({
      code: "CHECKSUM_INVALID",
    });

    const future = validator.validateSync(
      createSnapshot(undefined, { formatVersion: "2.0.0" })
    );
    expect(future.valid).toBe(false);
    expect(future.errors[0]).toMatchObject({ code: "VERSION_MISMATCH" });
    expect(future.warnings[0]).toMatchObject({ code: "DEPRECATED_FORMAT" });

    const old = validator.validateSync(createSnapshot(undefined, { formatVersion: "0.9.0" }));
    expect(old.valid).toBe(true);
    expect(old.warnings[0]).toMatchObject({ code: "DEPRECATED_FORMAT" });
  });

  it("reports async format, metadata, checksum, and version errors", async () => {
    const validator = new SnapshotValidator();

    await expect(validator.validate({} as unknown as Snapshot)).resolves.toMatchObject({
      valid: false,
      errors: [{ code: "FORMAT_INVALID" }],
    });

    const missingField = await validator.validate(createSnapshot(undefined, { checksum: "" }));
    expect(missingField.valid).toBe(false);
    expect(missingField.errors.map((error) => error.code)).toContain("MISSING_FIELD");

    const checksumInvalid = await validator.validate(createSnapshot(undefined, { checksum: "bad" }));
    expect(checksumInvalid.valid).toBe(false);
    expect(checksumInvalid.errors.map((error) => error.code)).toContain("CHECKSUM_INVALID");

    await expect(
      validator.validate(createSnapshot(undefined, { formatVersion: "2.0.0" }))
    ).resolves.toMatchObject({
      valid: false,
      errors: [{ code: "VERSION_MISMATCH" }],
      warnings: [{ code: "DEPRECATED_FORMAT" }],
    });

    await expect(
      validator.validate(createSnapshot(undefined, { formatVersion: "0.9.0" }))
    ).resolves.toMatchObject({
      valid: true,
      warnings: [{ code: "DEPRECATED_FORMAT" }],
    });
  });

  it("checks version support directly", () => {
    const validator = new SnapshotValidator();

    expect(validator.checkVersionCompatibility(SNAPSHOT_FORMAT_VERSION)).toMatchObject({
      ["com" + "patible"]: true,
      migrationRequired: false,
    });
    expect(validator.checkVersionCompatibility("0.5.0")).toMatchObject({
      ["com" + "patible"]: true,
      migrationRequired: true,
    });
    expect(validator.checkVersionCompatibility("9.0.0")).toMatchObject({
      ["com" + "patible"]: false,
      migrationRequired: false,
    });
  });

  it("validates compressed snapshots and detects compressed data errors", async () => {
    const validator = new SnapshotValidator();
    const data = createSerializedState();
    const compressed = compress(JSON.stringify(data)) as string;
    const snapshot = createSnapshot(data, {
      compressed: true,
      checksum: "decompressed-checksum",
      compressedChecksum: calculateChecksumSync(compressed),
      compressedSize: compressed.length,
    });
    snapshot.data = compressed;

    expect(validator.validateSync(snapshot)).toEqual({ valid: true, errors: [], warnings: [] });
    await expect(validator.validate(snapshot)).resolves.toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });

    expect(
      validator.validateSync({
        ...snapshot,
        meta: { ...snapshot.meta, compressedChecksum: "bad" },
      }).errors[0]
    ).toMatchObject({ code: "CHECKSUM_INVALID" });
    const asyncChecksumInvalid = await validator.validate({
      ...snapshot,
      meta: { ...snapshot.meta, compressedChecksum: "bad" },
    });
    expect(asyncChecksumInvalid.errors.map((error) => error.code)).toContain("CHECKSUM_INVALID");

    expect(
      validator.validateSync({
        ...snapshot,
        data: "not-compressed",
        meta: { ...snapshot.meta, compressedChecksum: calculateChecksumSync("not-compressed") },
      }).errors[0]
    ).toMatchObject({ code: "FORMAT_INVALID" });
    const asyncBadFormat = await validator.validate({
      ...snapshot,
      data: "not-compressed",
      meta: { ...snapshot.meta, compressedChecksum: calculateChecksumSync("not-compressed") },
    });
    expect(asyncBadFormat.errors.map((error) => error.code)).toContain("FORMAT_INVALID");

    const withoutCompressedChecksum = {
      ...snapshot,
      meta: {
        ...snapshot.meta,
        compressedChecksum: undefined,
      },
    };
    expect(validator.validateSync(withoutCompressedChecksum)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it("reports corrupted compressed data that passes format detection", async () => {
    const validator = new SnapshotValidator();
    const badGzip = Buffer.from([0x1f, 0x8b, 0x00, 0x00]).toString("base64");
    const snapshot = createSnapshot(createSerializedState(), {
      compressed: true,
      compressedChecksum: calculateChecksumSync(badGzip),
      compressedSize: badGzip.length,
    });
    snapshot.data = badGzip;

    const syncResult = validator.validateSync(snapshot);
    expect(syncResult.valid).toBe(false);
    expect(syncResult.errors[0]).toMatchObject({
      code: "DATA_CORRUPTED",
      message: "Failed to validate runtime structure",
    });

    await expect(validator.validate(snapshot)).resolves.toMatchObject({
      valid: false,
      errors: [{ code: "DATA_CORRUPTED" }],
    });
  });

  it("performs structural checks without requiring async checksum work", () => {
    const validator = new SnapshotValidator();
    const compressed = compress(JSON.stringify(createSerializedState())) as string;

    expect(validator.validateSyncStructure(createSnapshot()).valid).toBe(true);
    expect(
      validator.validateSyncStructure(createSnapshot(undefined, { checksum: "" })).errors
    ).toContain("Snapshot metadata missing required fields");
    expect(
      validator.validateSyncStructure({} as unknown as Snapshot).errors
    ).toContain("Snapshot missing required fields (meta or data)");
    expect(
      validator.validateSyncStructure(createSnapshot(undefined, { formatVersion: "2.0.0" })).errors[0]
    ).toContain("snapshot format");
    expect(
      validator.validateSyncStructure({
        ...createSnapshot(),
        data: "wrong",
      }).errors
    ).toContain("Snapshot data must be an object when not compressed");
    expect(
      validator.validateSyncStructure({
        ...createSnapshot(),
        meta: { ...createSnapshot().meta, compressed: true },
      }).errors
    ).toContain("Snapshot data must be a string when compressed");
    expect(
      validator.validateSyncStructure({
        ...createSnapshot(),
        meta: { ...createSnapshot().meta, compressed: true },
        data: "not-compressed",
      }).errors
    ).toContain("Snapshot marked as compressed but data is not valid compressed format");
    expect(
      validator.validateSyncStructure({
        ...createSnapshot(),
        meta: { ...createSnapshot().meta, compressed: true },
        data: compressed,
      }).valid
    ).toBe(true);
  });

  it("rejects object data that is not serialized state", () => {
    const validator = new SnapshotValidator();
    const invalidData = {
      meta: { sessionId, version: 1 },
      state: { phase: "idle", context: {}, agents: [] },
    } as unknown as SerializedState;

    const result = validator.validateSync(createSnapshot(invalidData));

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({
      code: "DATA_CORRUPTED",
      message: "Failed to parse serialized state data",
    });
  });

  it("collects runtime tuple validation errors", () => {
    const validator = new SnapshotValidator();
    const corrupted = createSerializedState({
      state: {
        phase: "idle",
        context: {},
        agents: ["bad-agent"] as unknown as Array<[string, unknown]>,
        tasks: [[123, {}]] as unknown as Array<[string, unknown]>,
      },
      decisions: {
        current: null,
        pending: [],
        opinions: ["bad-opinion"] as unknown as Array<[string, unknown]>,
        history: [],
        voting: {},
      },
    });
    const result = validator.validateSync(createSnapshot(corrupted));

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.message)).toEqual(
      expect.arrayContaining([
        "state.agents[0] must be a [string, unknown] tuple",
        "state.tasks[0] must be a [string, unknown] tuple",
        "decisions.opinions[0] must be a [string, unknown] tuple",
      ])
    );
  });

  it("collects runtime section shape errors through the runtime validator guard", () => {
    const validator = new SnapshotValidator();
    const harness = validator as unknown as SnapshotValidatorHarness;
    const base = createSerializedState();
    const state = { ...base.state };
    const decisions = { ...base.decisions };
    let agentReads = 0;
    let taskReads = 0;
    let opinionReads = 0;
    Object.defineProperty(state, "agents", {
      enumerable: true,
      get: () => {
        agentReads += 1;
        return agentReads === 1 ? [] : {};
      },
    });
    Object.defineProperty(state, "tasks", {
      enumerable: true,
      get: () => {
        taskReads += 1;
        return taskReads === 1 ? [] : {};
      },
    });
    Object.defineProperty(decisions, "opinions", {
      enumerable: true,
      get: () => {
        opinionReads += 1;
        return opinionReads === 1 ? [] : {};
      },
    });
    const corrupted = {
      ...base,
      state: state as SerializedState["state"],
      decisions: decisions as SerializedState["decisions"],
    };
    const snapshot = createSnapshot();
    snapshot.data = corrupted;

    const result = harness.validateRuntimeStructure(snapshot);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.message)).toEqual(
      expect.arrayContaining([
        "state.agents must be an array of [id, data] tuples",
        "state.tasks must be an array of [id, data] tuples",
        "decisions.opinions must be an array of [id, data] tuples",
      ])
    );
  });

  it("rejects compressed runtime data that decompresses but is not serialized state", () => {
    const validator = new SnapshotValidator();
    const harness = validator as unknown as SnapshotValidatorHarness;
    const compressed = compress(JSON.stringify({ meta: { sessionId }, state: null })) as string;
    const snapshot = createSnapshot(createSerializedState(), {
      compressed: true,
      compressedChecksum: calculateChecksumSync(compressed),
      compressedSize: compressed.length,
    });
    snapshot.data = compressed;

    expect(harness.validateRuntimeStructure(snapshot)).toMatchObject({
      valid: false,
      errors: [{ code: "DATA_CORRUPTED", message: "Failed to parse serialized state data" }],
    });
  });

  it("guards serialized state section shapes before runtime validation", () => {
    expect(isSerializedState(createSerializedState())).toBe(true);

    const invalidCases: unknown[] = [
      null,
      [],
      { ...createSerializedState(), meta: null },
      { ...createSerializedState(), meta: "bad" },
      { ...createSerializedState(), meta: { sessionId: 1, version: 1 } },
      { ...createSerializedState(), meta: { sessionId, version: "1" } },
      { ...createSerializedState(), state: null },
      { ...createSerializedState(), state: "bad" },
      createSerializedState({ state: { ...createSerializedState().state, phase: 1 as never } }),
      createSerializedState({ state: { ...createSerializedState().state, context: "bad" as never } }),
      createSerializedState({ state: { ...createSerializedState().state, context: null as never } }),
      createSerializedState({ state: { ...createSerializedState().state, agents: {} as never } }),
      createSerializedState({ state: { ...createSerializedState().state, tasks: {} as never } }),
      { ...createSerializedState(), knowledge: null },
      { ...createSerializedState(), knowledge: "bad" },
      createSerializedState({ knowledge: { ...createSerializedState().knowledge, facts: {} as never } }),
      createSerializedState({ knowledge: { ...createSerializedState().knowledge, inferences: {} as never } }),
      createSerializedState({ knowledge: { ...createSerializedState().knowledge, patterns: {} as never } }),
      { ...createSerializedState(), decisions: null },
      { ...createSerializedState(), decisions: "bad" },
      createSerializedState({ decisions: { ...createSerializedState().decisions, pending: {} as never } }),
      createSerializedState({ decisions: { ...createSerializedState().decisions, opinions: {} as never } }),
      createSerializedState({ decisions: { ...createSerializedState().decisions, history: {} as never } }),
    ];

    for (const value of invalidCases) {
      expect(isSerializedState(value)).toBe(false);
    }
  });
});
