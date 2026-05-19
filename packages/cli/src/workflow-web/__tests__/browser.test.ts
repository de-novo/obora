import { execFile } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import { openWorkflowUrl } from "../browser.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const expectedOpenCommand = (): { readonly file: string; readonly args: ReadonlyArray<string> } =>
  process.platform === "darwin"
    ? { file: "open", args: ["http://127.0.0.1:5174"] }
    : process.platform === "win32"
      ? { file: "cmd", args: ["/c", "start", "", "http://127.0.0.1:5174"] }
      : { file: "xdg-open", args: ["http://127.0.0.1:5174"] };

const withPlatform = async (
  platform: NodeJS.Platform,
  testFn: () => Promise<void>
): Promise<void> => {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  try {
    Object.defineProperty(process, "platform", { value: platform });
    await testFn();
  } finally {
    if (descriptor) {
      Object.defineProperty(process, "platform", descriptor);
    }
  }
};

describe("workflow web browser opener", () => {
  it("opens the workflow URL with the platform command", async () => {
    vi.mocked(execFile).mockImplementation((_file, _args, callback) => {
      callback?.(null, "", "");
      return undefined as never;
    });

    await openWorkflowUrl("http://127.0.0.1:5174");

    const expected = expectedOpenCommand();
    expect(execFile).toHaveBeenCalledWith(expected.file, expected.args, expect.any(Function));
  });

  it("rejects when the platform opener fails", async () => {
    vi.mocked(execFile).mockImplementation((_file, _args, callback) => {
      callback?.(new Error("open failed"), "", "");
      return undefined as never;
    });

    await expect(openWorkflowUrl("http://127.0.0.1:5174")).rejects.toThrow("open failed");
  });

  it("uses cmd on Windows and xdg-open on Linux", async () => {
    vi.mocked(execFile).mockImplementation((_file, _args, callback) => {
      callback?.(null, "", "");
      return undefined as never;
    });

    await withPlatform("win32", () => openWorkflowUrl("http://127.0.0.1:5174"));
    await withPlatform("linux", () => openWorkflowUrl("http://127.0.0.1:5174"));

    expect(execFile).toHaveBeenCalledWith(
      "cmd",
      ["/c", "start", "", "http://127.0.0.1:5174"],
      expect.any(Function)
    );
    expect(execFile).toHaveBeenCalledWith(
      "xdg-open",
      ["http://127.0.0.1:5174"],
      expect.any(Function)
    );
  });
});
