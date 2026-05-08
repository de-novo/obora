import { afterEach, describe, expect, it, vi } from "vitest";

import { CLIError } from "../errors.js";
import { main } from "../index.js";

describe("main", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses the process argv with the root CLI", async () => {
    const parseAsync = vi.fn().mockResolvedValue(undefined);

    await main(process.argv, () => ({ parseAsync }));

    expect(parseAsync).toHaveBeenCalledWith(process.argv);
  });

  it("normalizes CLIError exits at the public entrypoint", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      main(process.argv, () => ({
        parseAsync: vi.fn().mockRejectedValue(new CLIError("bad input", 12)),
      }))
    ).rejects.toThrow("process.exit:12");
    expect(error).toHaveBeenCalledWith("bad input");
    expect(exit).toHaveBeenCalledWith(12);
  });

  it("rethrows unexpected errors", async () => {
    await expect(
      main(process.argv, () => ({
        parseAsync: vi.fn().mockRejectedValue(new Error("boom")),
      }))
    ).rejects.toThrow("boom");
  });
});
