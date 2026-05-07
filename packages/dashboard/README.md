# @obora/dashboard

Obora dashboard — web monitoring and control server.

## Overview

The dashboard provides a web-based interface for monitoring and controlling Obora runtime executions, including:

- Real-time execution status and audit event streaming
- Policy management and hot-reload
- Run history and inspection
- Notification rules and WebSocket updates

## Development

```bash
# Start dev server (client + server)
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test
```

## Server Bootstrap API

The package exposes `bootstrapDashboardServer(...)` for callers that need a
CLI-friendly start/stop contract without copying Fastify lifecycle details:

```js
import { bootstrapDashboardServer } from './dist/index.js';

const dashboard = await bootstrapDashboardServer({
  config: { host: '127.0.0.1', port: 0 },
});

console.log(dashboard.url);
await dashboard.close();
```

The helper returns resolved `host`, `port`, `url`, static asset status, the
Fastify app handle, and an idempotent `close()` method. It also normalizes
bootstrap failures with `DashboardBootstrapError` codes for invalid host/port,
missing required static assets, and listen failures.

## Architecture

- **Client**: React + Vite SPA served via Fastify static plugin
- **Server**: Fastify with WebSocket support for real-time updates
- **Integration**: Uses `@obora/runtime` for core runtime operations

## Endpoints

- `GET /api/audit/events` — Audit event query
- `GET /api/history/runs` — Run history with filters
- `POST /api/policies` — Policy creation
- `POST /api/notifications/rules` — Notification rule management
- `WS /ws` — WebSocket for real-time updates
