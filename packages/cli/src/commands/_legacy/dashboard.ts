import { createDashboardServer } from "@obora/dashboard";
import { Command } from "commander";
import open from "open";

interface DashboardOptions {
  port?: string;
  noOpen?: boolean;
}

async function runDashboard(options: DashboardOptions): Promise<void> {
  const port = Number(options.port ?? "4789");
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }

  const { app, config } = await createDashboardServer({ port });
  await app.listen({ host: config.host, port });

  const url = `http://${config.host}:${port}`;
  console.log(`Dashboard running: ${url}`);

  if (!options.noOpen) {
    await open(url);
  }

  const stop = async () => {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

export function createDashboardCommand(): Command {
  return new Command("dashboard")
    .description("Start web dashboard")
    .option("-p, --port <port>", "Dashboard port", "4789")
    .option("--no-open", "Do not open browser automatically")
    .action(async (options: DashboardOptions) => {
      await runDashboard(options);
    });
}

export { runDashboard };
