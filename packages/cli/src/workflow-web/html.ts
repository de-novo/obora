import type { WorkflowLocator } from "@obora/sdk";

import type { WorkflowWebMode } from "./types.js";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const renderWorkflowWebHtml = ({
  locator,
  mode,
  token,
}: {
  readonly locator: WorkflowLocator;
  readonly mode: WorkflowWebMode;
  readonly token: string;
}): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Obora Workflow ${escapeHtml(mode)}</title>
    <style>
      :root {
        color-scheme: light;
        --border: #d7dce2;
        --text: #17202a;
        --muted: #687386;
        --surface: #ffffff;
        --band: #f5f7fa;
        --accent: #1769aa;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--text);
        background: var(--band);
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 18px 24px;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
      }
      main {
        display: grid;
        grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
        gap: 16px;
        padding: 16px;
      }
      aside, section {
        min-width: 0;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
      }
      aside { padding: 16px; }
      section { overflow: hidden; }
      h1 {
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
      }
      h2 {
        margin: 0 0 12px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0;
        color: var(--muted);
      }
      dl {
        display: grid;
        grid-template-columns: 84px minmax(0, 1fr);
        gap: 10px 12px;
        margin: 0;
        font-size: 13px;
      }
      dt { color: var(--muted); }
      dd { margin: 0; overflow-wrap: anywhere; }
      .badge {
        display: inline-flex;
        align-items: center;
        height: 28px;
        padding: 0 10px;
        border: 1px solid var(--border);
        border-radius: 999px;
        font-size: 12px;
        color: var(--muted);
        background: #fbfcfd;
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      button {
        height: 34px;
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 0 12px;
        background: var(--surface);
        color: var(--text);
        cursor: pointer;
      }
      button.primary {
        border-color: var(--accent);
        background: var(--accent);
        color: #fff;
      }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }
      textarea {
        display: block;
        width: 100%;
        min-height: calc(100vh - 96px);
        border: 0;
        border-top: 1px solid var(--border);
        resize: vertical;
        padding: 16px;
        font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        color: var(--text);
        background: #fbfcfd;
      }
      .status {
        min-height: 18px;
        font-size: 12px;
        color: var(--muted);
      }
      @media (max-width: 820px) {
        main { grid-template-columns: 1fr; }
        header { align-items: flex-start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>${escapeHtml(locator.name)}</h1>
        <span class="badge">${escapeHtml(locator.scope)} workflow</span>
      </div>
      <div class="toolbar">
        <span class="status" id="status">Loading</span>
        <button id="reload" type="button">Reload</button>
        <button id="save" type="button" class="primary"${mode === "view" || !locator.editable ? " disabled" : ""}>Save</button>
      </div>
    </header>
    <main>
      <aside>
        <h2>Locator</h2>
        <dl>
          <dt>Mode</dt><dd>${escapeHtml(mode)}</dd>
          <dt>Scope</dt><dd>${escapeHtml(locator.scope)}</dd>
          <dt>Path</dt><dd>${escapeHtml(locator.displayPath)}</dd>
          <dt>Steps</dt><dd>${String(locator.stepCount)}</dd>
          <dt>Editable</dt><dd>${locator.editable && mode === "build" ? "yes" : "no"}</dd>
        </dl>
      </aside>
      <section aria-label="Workflow YAML editor">
        <textarea id="yaml" spellcheck="false" ${mode === "view" || !locator.editable ? "readonly" : ""}></textarea>
      </section>
    </main>
    <script>
      const token = new URLSearchParams(location.search).get("token") || ${JSON.stringify(token)};
      const workflowId = ${JSON.stringify(encodeURIComponent(locator.id))};
      const apiUrl = "/api/workflows/" + workflowId + "?token=" + encodeURIComponent(token);
      const statusEl = document.getElementById("status");
      const yamlEl = document.getElementById("yaml");
      const reloadEl = document.getElementById("reload");
      const saveEl = document.getElementById("save");
      const setStatus = (message) => { statusEl.textContent = message; };
      const loadWorkflow = async () => {
        setStatus("Loading");
        const response = await fetch(apiUrl);
        const payload = await response.json();
        yamlEl.value = payload.yaml;
        yamlEl.dataset.revision = payload.revision;
        setStatus("Loaded");
      };
      const saveWorkflow = async () => {
        setStatus("Saving");
        const response = await fetch(apiUrl, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ yaml: yamlEl.value, revision: yamlEl.dataset.revision })
        });
        const payload = await response.json();
        if (response.ok) {
          yamlEl.dataset.revision = payload.revision;
        }
        setStatus(response.ok ? "Saved" : payload.error || "Save failed");
      };
      reloadEl.addEventListener("click", () => loadWorkflow().catch((error) => setStatus(String(error))));
      saveEl.addEventListener("click", () => saveWorkflow().catch((error) => setStatus(String(error))));
      loadWorkflow().catch((error) => setStatus(String(error)));
    </script>
  </body>
</html>`;
