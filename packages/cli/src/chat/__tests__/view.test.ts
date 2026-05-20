import type { WorkflowLocator } from "@obora/sdk";
import { describe, expect, it } from "vitest";

import { appendChatMessage, createChatMessage, createInitialChatState } from "../state.js";
import { renderChatView } from "../view.js";
import type { ChatSessionStatus } from "../types.js";

const locator: WorkflowLocator = {
  id: "project:abc",
  scope: "project",
  name: "release-readiness",
  path: "/repo/.obora/workflows/release-readiness.yaml",
  displayPath: ".obora/workflows/release-readiness.yaml",
  editable: true,
  sourceDir: "/repo/.obora/workflows",
  stepCount: 4,
  projectRoot: "/repo",
};

const renderedText = (lines: ReadonlyArray<string>): string => lines.join("\n");

describe("renderChatView", () => {
  it("renders a two-column operator console for wide terminals", () => {
    const state = appendChatMessage(
      {
        ...createInitialChatState({
          sessionId: "session-a",
          cwd: "/repo",
          dryRun: true,
          providerName: "openrouter",
          modelName: "deepseek/deepseek-v4-flash:free",
          workflowTarget: "release-readiness",
        }),
        workflowLocator: locator,
        status: "ready",
        lastRunCommand: "obora run .obora/workflows/release-readiness.yaml",
      },
      createChatMessage("user", "prepare release notes", () => new Date("2026-05-20T01:02:03Z"))
    );

    const output = renderedText(
      renderChatView(state, {
        columns: 120,
        rendererLabel: "@earendil-works/pi-tui differential rendering",
      })
    );

    expect(output).toContain("OBORA CHAT");
    expect(output).toContain("[TRANSCRIPT]");
    expect(output).toContain("[SESSION]");
    expect(output).toContain("[WORKFLOW]");
    expect(output).toContain("[ACTIVITY]");
    expect(output).toContain("deepseek/deepseek-v4-flash:free");
    expect(output).toContain("prepare release notes");
    expect(output).toContain("steps: 4");
  });

  it("falls back to a stacked layout for narrow terminals", () => {
    const output = renderedText(
      renderChatView(
        createInitialChatState({
          sessionId: "session-a",
          cwd: "/repo",
          dryRun: false,
        }),
        { columns: 80, rendererLabel: "plain text fallback" }
      )
    );

    expect(output).toContain("[SESSION]");
    expect(output).toContain("[COMMAND PALETTE]");
    expect(output).toContain("plain text fallback");
    expect(output.split("\n").every((line) => line.length <= 80)).toBe(true);
  });

  it("renders unresolved workflow targets, assistant messages, and clamped narrow widths", () => {
    const state = appendChatMessage(
      {
        ...createInitialChatState({
          sessionId: "session-b",
          cwd: "/repo/packages/cli/src/chat/with/a/very/long/project/path",
          dryRun: false,
          workflowTarget: "review-flow",
        }),
        status: "running",
      },
      createChatMessage(
        "assistant",
        "Working through the selected workflow.",
        () => new Date("2026-05-20T02:03:04Z")
      )
    );

    const output = renderedText(renderChatView(state, { columns: 20 }));

    expect(output).toContain("RUNNING");
    expect(output).toContain("review-flow (unresolved)");
    expect(output).toContain("OBORA");
    expect(output).toContain("Working through the selected workflow.");
    expect(output.split("\n").every((line) => line.length <= 78)).toBe(true);
  });

  it.each([
    ["resolving", "RESOLVING"],
    ["completed", "DONE"],
  ] as ReadonlyArray<readonly [ChatSessionStatus, string]>)(
    "renders %s status",
    (status, label) => {
      const output = renderedText(
        renderChatView(
          {
            ...createInitialChatState({
              sessionId: `session-${status}`,
              cwd: "/repo",
              dryRun: true,
            }),
            status,
            workflowLocator: { ...locator, editable: false },
          },
          { columns: 160 }
        )
      );

      expect(output).toContain(label);
      expect(output).toContain("editable: no");
    }
  );
});
