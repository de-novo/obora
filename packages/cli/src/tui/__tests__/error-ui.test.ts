import { afterEach, describe, expect, it, vi } from "vitest";

import { promptErrorAction } from "../error-ui.js";

const originalStdinIsTTY = process.stdin.isTTY;
const originalStdoutIsTTY = process.stdout.isTTY;

function setTTY(stdin: boolean, stdout: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: stdin,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: stdout,
  });
}

describe("promptErrorAction", () => {
  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalStdinIsTTY,
    });
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutIsTTY,
    });
    vi.restoreAllMocks();
  });

  it("returns abort without prompting when not attached to a TTY", async () => {
    setTTY(false, false);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(promptErrorAction({ stepName: "draft", error: "boom" })).resolves.toBe("abort");
    expect(error.mock.calls.map((args) => args.join(" ")).join("\n")).toContain(
      "Step failed: draft"
    );
  });

  it("accepts retry, skip, and default abort responses in TTY mode", async () => {
    setTTY(true, true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const retry = promptErrorAction({ stepName: "draft", error: "boom" });
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    process.stdin.emit("data", Buffer.from("retry\n"));
    await expect(retry).resolves.toBe("retry");

    const skip = promptErrorAction({ stepName: "draft", error: "boom" });
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    process.stdin.emit("data", Buffer.from("s\n"));
    await expect(skip).resolves.toBe("skip");

    const abort = promptErrorAction({ stepName: "draft", error: "boom" });
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(3));
    process.stdin.emit("data", Buffer.from("\n"));
    await expect(abort).resolves.toBe("abort");
    expect(write).toHaveBeenCalledWith(
      "Select action [r]etry / [s]kip / [a]bort (default: abort): "
    );
  });
});
