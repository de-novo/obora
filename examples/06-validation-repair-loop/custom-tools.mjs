import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ARTIFACT_DIR = join(__dirname, "artifacts");
const RELEASE_NOTE_PATH = join(ARTIFACT_DIR, "release-note.md");
const VALIDATION_HISTORY_PATH = join(ARTIFACT_DIR, "validation-history.json");

async function ensureArtifactsDir() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
}

async function loadHistory() {
  try {
    return JSON.parse(await readFile(VALIDATION_HISTORY_PATH, "utf8"));
  } catch {
    return [];
  }
}

async function saveHistory(history) {
  await ensureArtifactsDir();
  await writeFile(VALIDATION_HISTORY_PATH, JSON.stringify(history, null, 2) + "\n", "utf8");
}

function buildSignature(result) {
  if (result.passed) return "pass";
  return JSON.stringify({
    summary: result.summary,
    failedChecks: result.failedChecks.map((entry) => `${entry.name}:${entry.message}`),
  });
}

export const validateReleaseNoteTool = {
  definition: {
    type: "function",
    function: {
      name: "validate_release_note",
      description: "Validate that artifacts/release-note.md exists and includes a Release Note heading plus a READY marker.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  execute: async () => {
    await ensureArtifactsDir();
    const history = await loadHistory();
    let content = "";

    try {
      content = await readFile(RELEASE_NOTE_PATH, "utf8");
    } catch {
      const result = {
        passed: false,
        summary: "release-note.md is missing",
        errorCode: "VALIDATION_ERROR",
        failedChecks: [
          { name: "missing-file", message: "artifacts/release-note.md is missing", file: "artifacts/release-note.md" },
        ],
        artifactPaths: [RELEASE_NOTE_PATH],
      };
      result.signature = buildSignature(result);
      history.push(result);
      await saveHistory(history);
      return JSON.stringify(result, null, 2);
    }

    const failedChecks = [];
    if (!content.includes("# Release Note")) {
      failedChecks.push({ name: "heading", message: "Missing '# Release Note' heading", file: "artifacts/release-note.md" });
    }
    if (!content.includes("READY")) {
      failedChecks.push({ name: "marker", message: "Missing READY marker", file: "artifacts/release-note.md" });
    }

    const result = {
      passed: failedChecks.length === 0,
      summary: failedChecks.length === 0 ? "Validation passed" : failedChecks.map((entry) => entry.message).join("; "),
      ...(failedChecks.length === 0 ? {} : { errorCode: "VALIDATION_ERROR" }),
      failedChecks,
      artifactPaths: [RELEASE_NOTE_PATH],
    };
    result.signature = buildSignature(result);
    history.push(result);
    await saveHistory(history);
    return JSON.stringify(result, null, 2);
  },
};

export const customTools = [validateReleaseNoteTool];
