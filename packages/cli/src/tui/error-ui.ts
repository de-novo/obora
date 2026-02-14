import type { TuiAction } from "./run-tui.js";

interface PiTuiModule {
  SelectList?: unknown;
}

export async function promptErrorAction(params: {
  stepName: string;
  error: string;
}): Promise<TuiAction> {
  let piTui: PiTuiModule | null = null;
  try {
    piTui = (await import("@mariozechner/pi-tui")) as PiTuiModule;
  } catch {
    piTui = null;
  }

  console.error(`\nStep failed: ${params.stepName}`);
  console.error(params.error);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return "abort";
  }

  if (piTui?.SelectList) {
    // SelectList is loaded to keep pi-tui integration path active.
    // Runtime interaction falls back to readline for compatibility.
  }

  process.stdout.write("Select action [r]etry / [s]kip / [a]bort (default: abort): ");

  return new Promise<TuiAction>((resolve) => {
    const onData = (buf: Buffer) => {
      const value = String(buf).trim().toLowerCase();
      process.stdin.off("data", onData);
      if (value === "r" || value === "retry") return resolve("retry");
      if (value === "s" || value === "skip") return resolve("skip");
      resolve("abort");
    };

    process.stdin.on("data", onData);
  });
}
