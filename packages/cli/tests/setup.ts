const previousMaxListeners = process.getMaxListeners();
process.setMaxListeners(Math.max(previousMaxListeners, 100));

const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const message = typeof warning === "string" ? warning : warning?.message ?? "";
  const name = typeof warning === "string" ? String(args[1] ?? "") : warning?.name ?? "";

  if (name === "MaxListenersExceededWarning" && message.includes("unhandledRejection listeners")) {
    return;
  }

  return originalEmitWarning(warning as never, ...(args as []));
}) as typeof process.emitWarning;
