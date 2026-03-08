import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APP_DIR = join(__dirname, "app");
const ARTIFACT_DIR = join(__dirname, "artifacts");
const PREVIEW_LOG = join(__dirname, ".preview.log");
const VALIDATION_HISTORY_PATH = join(ARTIFACT_DIR, "VALIDATION-HISTORY.json");
const VALIDATOR_SCRIPT = join(__dirname, "validator.sh");
let lastValidationCache = undefined;

function buildSignature(result) {
  if (result.passed) return "pass";
  const checks = (result.failedChecks ?? []).map((check) => `${check.name}:${check.file ?? ""}:${check.message}`);
  return JSON.stringify({ errorCode: result.errorCode ?? null, summary: result.summary ?? "", failedChecks: checks });
}

async function ensureArtifactsDir() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
}

async function loadValidationHistory() {
  try {
    return JSON.parse(await readFile(VALIDATION_HISTORY_PATH, "utf8"));
  } catch {
    return [];
  }
}

async function saveValidationHistory(history) {
  await ensureArtifactsDir();
  await writeFile(VALIDATION_HISTORY_PATH, JSON.stringify(history, null, 2) + "\n", "utf8");
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code, signal) => {
      resolve({ code: code ?? 1, signal, stdout, stderr });
    });
  });
}

async function computeAppSnapshotHash() {
  const files = [
    join(__dirname, "app", "package.json"),
    join(__dirname, "app", "tsconfig.json"),
    join(__dirname, "app", "tsconfig.app.json"),
    join(__dirname, "app", "tsconfig.node.json"),
    join(__dirname, "app", "vite.config.ts"),
    join(__dirname, "app", "src", "App.tsx"),
    join(__dirname, "app", "src", "main.tsx"),
    join(__dirname, "app", "src", "types.ts"),
    join(__dirname, "app", "src", "styles.css"),
    join(__dirname, "app", "src", "data", "seed.ts"),
    join(__dirname, "app", "src", "components", "Sidebar.tsx"),
    join(__dirname, "app", "src", "components", "PostCard.tsx"),
    join(__dirname, "app", "src", "components", "Feed.tsx"),
    join(__dirname, "app", "src", "components", "RightRail.tsx"),
    join(__dirname, "app", "src", "components", "CreatePostModal.tsx"),
  ];

  const hash = createHash("sha256");
  for (const path of files) {
    try {
      const content = await readFile(path, "utf8");
      hash.update(path);
      hash.update("\n");
      hash.update(content);
      hash.update("\n---\n");
    } catch {
      hash.update(path);
      hash.update("\n[MISSING]\n---\n");
    }
  }
  return hash.digest("hex");
}

function lastMeaningfulLine(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-1)[0] ?? "Validation failed";
}

function extractFailedChecks(output) {
  const checks = [];
  const push = (name, message, file) => {
    if (!checks.some((entry) => entry.name === name && entry.message === message && entry.file === file)) {
      checks.push({ name, message, ...(file ? { file } : {}) });
    }
  };

  if (output.includes("Generated app contains Next.js-specific patterns inside a Vite project")) {
    push("stack", "Generated app contains Next.js-specific patterns inside a Vite project");
  }
  if (output.includes("Only src/main.tsx may import ./styles.css; unexpected CSS imports found")) {
    push("css-import", "Only src/main.tsx may import ./styles.css; unexpected CSS imports found", "app/src");
  }
  if (output.includes("tsconfig must include vite/client types")) {
    push("vite-types", "tsconfig must include vite/client types", "app/tsconfig.app.json");
  }

  const missingFileMatches = output.matchAll(/Missing generated file: (.+)/g);
  for (const match of missingFileMatches) {
    push("missing-file", `Missing generated file: ${match[1]}`, match[1]);
  }

  const tsMatches = output.matchAll(/TS\d+:[^\n]+/g);
  for (const match of tsMatches) {
    push("typescript", match[0]);
  }

  const expectedMatches = output.matchAll(/expected [^\n]+ got [^\n]+/gi);
  for (const match of expectedMatches) {
    push("playwright", match[0]);
  }

  if (checks.length === 0) {
    push("validation", lastMeaningfulLine(output));
  }

  return checks;
}

export const fetchUrlTool = {
  definition: {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch a URL and return its contents as text.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL to fetch" },
          maxChars: { type: "number", description: "Optional max characters to return" },
        },
        required: ["url"],
      },
    },
  },
  execute: async (args) => {
    const url = typeof args.url === "string" ? args.url : "";
    const maxChars = typeof args.maxChars === "number" && Number.isFinite(args.maxChars)
      ? Math.max(200, Math.floor(args.maxChars))
      : 15000;
    if (!/^https?:\/\//.test(url)) return "Error: url must start with http:// or https://";
    const response = await fetch(url, {
      headers: {
        "user-agent": "obora-sandbox-live-fetch/1.0",
        "accept": "text/plain, application/json, text/html;q=0.9, */*;q=0.8",
      },
    });
    const text = await response.text();
    return JSON.stringify({
      url,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      body: text.length > maxChars ? `${text.slice(0, maxChars)}\n...[truncated]` : text,
    }, null, 2);
  },
};

export const npmPackageInfoTool = {
  definition: {
    type: "function",
    function: {
      name: "npm_package_info",
      description: "Fetch package metadata from the npm registry and return the latest version plus key metadata.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "npm package name" },
        },
        required: ["name"],
      },
    },
  },
  execute: async (args) => {
    const name = typeof args.name === "string" ? args.name : "";
    if (!name) return "Error: package name is required";
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      headers: {
        "user-agent": "obora-sandbox-npm-info/1.0",
        "accept": "application/json",
      },
    });
    if (!response.ok) {
      return JSON.stringify({ name, status: response.status, ok: false }, null, 2);
    }
    const data = await response.json();
    const latest = data?.["dist-tags"]?.latest;
    const latestMeta = latest ? data?.versions?.[latest] : undefined;
    return JSON.stringify({
      name,
      latest,
      description: data?.description,
      dependencies: latestMeta?.dependencies,
      peerDependencies: latestMeta?.peerDependencies,
    }, null, 2);
  },
};

export const runValidationTool = {
  definition: {
    type: "function",
    function: {
      name: "run_validation",
      description: "Run the real app validator (install, typecheck, build, preview, Playwright) and return a structured ValidationResult JSON payload.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  execute: async () => {
    await ensureArtifactsDir();
    const history = await loadValidationHistory();
    const appSnapshotHash = await computeAppSnapshotHash();

    if (lastValidationCache?.appSnapshotHash === appSnapshotHash && lastValidationCache.result) {
      return JSON.stringify({
        ...lastValidationCache.result,
        summary: `${lastValidationCache.result.summary} (cached duplicate call)` ,
      }, null, 2);
    }

    const attempt = history.length + 1;
    const port = 4322 + attempt;
    const logPath = join(ARTIFACT_DIR, `VALIDATION-ATTEMPT-${String(attempt).padStart(2, "0")}.log`);

    const result = await runCommand("bash", [VALIDATOR_SCRIPT], {
      cwd: __dirname,
      env: {
        ...process.env,
        ATTEMPT: String(attempt),
        APP_DIR,
        SERVER_PORT: String(port),
        PREVIEW_LOG,
      },
    });

    const combinedOutput = `${result.stdout}${result.stderr}`.trim();
    await writeFile(logPath, `${combinedOutput}\n`, "utf8");

    const failedChecks = result.code === 0 ? [] : extractFailedChecks(combinedOutput);
    const validationResult = {
      passed: result.code === 0,
      summary:
        result.code === 0
          ? `Validation passed on attempt ${attempt}`
          : failedChecks.map((entry) => entry.message).slice(0, 3).join("; "),
      ...(result.code === 0 ? {} : { errorCode: "VALIDATION_ERROR" }),
      failedChecks,
      logPath,
      artifactPaths: [logPath],
      signature: undefined,
    };
    validationResult.signature = buildSignature(validationResult);

    history.push({ attempt, port, appSnapshotHash, ...validationResult });
    await saveValidationHistory(history);
    lastValidationCache = {
      appSnapshotHash,
      result: validationResult,
    };

    return JSON.stringify(validationResult, null, 2);
  },
};

export const customTools = [fetchUrlTool, npmPackageInfoTool, runValidationTool];
