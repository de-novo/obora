import { afterEach, describe, expect, it, vi } from "vitest";

describe("main", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("parses the process argv with the root CLI", async () => {
    const parseAsync = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../cli.js", () => ({
      createCLI: () => ({ parseAsync }),
    }));

    const { main } = await import("../index.js");
    await main();

    expect(parseAsync).toHaveBeenCalledWith(process.argv);
  });

  it("normalizes CLIError exits at the public entrypoint", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.doMock("../cli.js", async () => {
      const { CLIError } = await import("../errors.js");
      return {
        createCLI: () => ({
          parseAsync: vi.fn().mockRejectedValue(new CLIError("bad input", 12)),
        }),
      };
    });

    const { main } = await import("../index.js");

    await expect(main()).rejects.toThrow("process.exit:12");
    expect(error).toHaveBeenCalledWith("bad input");
    expect(exit).toHaveBeenCalledWith(12);
  });

  it("rethrows unexpected errors", async () => {
    vi.doMock("../cli.js", () => ({
      createCLI: () => ({
        parseAsync: vi.fn().mockRejectedValue(new Error("boom")),
      }),
    }));

    const { main } = await import("../index.js");

    await expect(main()).rejects.toThrow("boom");
  });
});
