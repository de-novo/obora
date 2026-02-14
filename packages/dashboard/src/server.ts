import { createServer } from "node:http";
import { join } from "node:path";

import express from "express";

import { getFeatureStatusHandler, getFeaturesHandler } from "./routes/features.js";
import type { RealtimeEvent } from "./types.js";
import { createDashboardWsServer, type DashboardWs } from "./ws.js";

export interface DashboardServer {
  start: (port?: number) => Promise<number>;
  stop: () => Promise<void>;
  emit: (event: RealtimeEvent) => void;
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Obora Dashboard</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;margin:2rem;background:#111;color:#eee}.grid{display:grid;gap:.75rem}.card{background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:1rem}.muted{color:#aaa;font-size:.9rem}pre{background:#171717;border:1px solid #333;border-radius:8px;padding:.75rem;overflow:auto}</style>
</head><body><h1>Obora Dashboard</h1><p class="muted">Feature status + realtime workflow events</p><div id="features" class="grid"></div><h2>Realtime events</h2><pre id="events"></pre>
<script>
const featuresEl=document.getElementById('features'); const eventsEl=document.getElementById('events');
async function loadFeatures(){const res=await fetch('/api/features');const data=await res.json();featuresEl.innerHTML=data.features.map(function(f){return '<div class="card"><div><strong>'+f.name+'</strong> <strong>'+f.status+'</strong></div><div class="muted">workflow: '+f.workflow+'</div><div class="muted">stage: '+(f.currentStage??'-')+'</div><div class="muted">updated: '+(f.updatedAt??'-')+'</div></div>';}).join('');}
function connectWs(){const p=location.protocol==='https:'?'wss':'ws';const ws=new WebSocket(p+'://'+location.host+'/ws');ws.onmessage=(m)=>{const line=JSON.stringify(JSON.parse(m.data),null,2);eventsEl.textContent=(line+'\n\n'+eventsEl.textContent).slice(0,20000);loadFeatures().catch(()=>{});};ws.onclose=()=>setTimeout(connectWs,1000);} loadFeatures(); connectWs();
</script></body></html>`;

export function createDashboardServer(projectRoot: string = process.cwd()): DashboardServer {
  const app = express();
  const httpServer = createServer(app);
  let ws: DashboardWs | null = null;

  app.get("/", (_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(DASHBOARD_HTML);
  });

  app.get("/api/features", getFeaturesHandler(projectRoot));
  app.get("/api/features/:name/status", getFeatureStatusHandler(projectRoot));

  // compatibility route if someone expects static path
  app.use("/public", express.static(join(projectRoot, "packages", "dashboard", "src", "public")));

  return {
    start: (port = 4789) =>
      new Promise<number>((resolve) => {
        httpServer.listen(port, () => {
          ws = createDashboardWsServer(httpServer);
          resolve(port);
        });
      }),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        ws?.close();
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
    emit: (event: RealtimeEvent) => {
      ws?.broadcast(event);
    },
  };
}
