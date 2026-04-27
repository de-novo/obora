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
