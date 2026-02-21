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

  const server = createDashboardServer(process.cwd());
  await server.start(port);

  const url = `http://localhost:${port}`;
  console.log(`Dashboard running: ${url}`);

  if (!options.noOpen) {
    await open(url);
  }

  const stop = async () => {
    await server.stop();
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
