import { describe, expect, it } from "vitest";

import { executeWorkflowHook, resolveWorkflowHook } from "../hooks.js";

describe("workflow hooks", () => {
  it("prefers step hooks over workflow hooks for a lifecycle", () => {
    const resolved = resolveWorkflowHook(
      {
        pre_step: { shell: "printf global" },
        post_step: { shell: "printf post-global" },
      },
      {
        pre_step: { shell: "printf step" },
      },
      "pre_step"
    );

    expect(resolved).toEqual({ shell: "printf step" });
    expect(
      resolveWorkflowHook(
        {
          post_step: { shell: "printf post-global" },
        },
        {
          pre_step: { shell: "printf step" },
        },
        "post_step"
      )
    ).toEqual({ shell: "printf post-global" });
  });

  it("executes shell hooks and captures stdout/stderr", async () => {
    const result = await executeWorkflowHook(
      {
        shell: "printf 'hello'; printf 'warn' 1>&2",
      },
      "pre_step"
    );

    expect(result.success).toBe(true);
    expect(result.stdout).toBe("hello");
    expect(result.stderr).toBe("warn");
    expect(result.exitCode).toBe(0);
  });

  it("returns failed hook results for non-zero exits", async () => {
    const result = await executeWorkflowHook(
      {
        shell: "printf 'boom' 1>&2; exit 7",
      },
      "post_step"
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(7);
    expect(result.stderr).toContain("boom");
  });
});
