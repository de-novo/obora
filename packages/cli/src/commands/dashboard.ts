import { defineCommand } from "citty";
import { consola } from "consola";
import { getAgentDb } from "../dashboard/server/db";
import { startServer, stopServer } from "../dashboard/server";

export const dashboardCommand = defineCommand({
  meta: {
    name: "dashboard",
    description: "Start workflow monitoring dashboard server",
  },
  args: {
    port: {
      type: "string",
      alias: "p",
      description: "Port number",
      default: "3100",
    },
    host: {
      type: "string",
      description: "Host address",
      default: "localhost",
    },
  },
  async run({ args }) {
    const port = Number.parseInt(args.port, 10);
    const host = args.host;

    if (Number.isNaN(port) || port < 1 || port > 65535) {
      consola.error(`Invalid port number: ${args.port}`);
      process.exit(1);
    }

    const db = getAgentDb();

    if (!db.isAvailable()) {
      consola.error("Agent database not found");
      consola.info(`Expected location: ${db.getDbPath()}`);
      consola.info("The database is created automatically when Claude Code agents run.");
      process.exit(1);
    }

    console.log("Starting dashboard server...");

    try {
      const address = await startServer(port, host);
      console.log(`Dashboard server running at ${address}`);
      console.log("Press Ctrl+C to stop the server");

      process.on("SIGINT", async () => {
        consola.info("\nShutting down dashboard server...");
        await stopServer();
        consola.success("Server stopped");
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        consola.info("\nShutting down dashboard server...");
        await stopServer();
        consola.success("Server stopped");
        process.exit(0);
      });

      // Keep process alive until signal received
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 60000));
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("already running")) {
          consola.error("Server is already running");
        } else if (error.message.includes("EADDRINUSE")) {
          consola.error(`Port ${port} is already in use`);
          consola.info("Try a different port with --port flag");
        } else {
          consola.error("Failed to start server:", error.message);
        }
      } else {
        consola.error("Failed to start server");
      }
      process.exit(1);
    }
  },
});
