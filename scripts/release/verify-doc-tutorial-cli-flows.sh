#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

CLI="$ROOT_DIR/packages/cli/bin/obora.js"

if [[ ! -f "$ROOT_DIR/packages/cli/dist/index.js" ]]; then
  echo "[FAIL] Built CLI is missing. Run pnpm build before tutorial CLI flow verification."
  exit 1
fi

TMP_PARENT="${TMPDIR:-/tmp}"
TMP_DIR="$(mktemp -d "$TMP_PARENT/obora-doc-cli-flows.XXXXXX")"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

export HOME="$TMP_DIR/home"
mkdir -p "$HOME"

unset OPENAI_API_KEY
unset ANTHROPIC_API_KEY
unset ZAI_API_KEY
unset OBORA_LLM_PROVIDER
unset OBORA_LLM_MODEL
unset OBORA_LLM_API_KEY

run_json() {
  local cwd="$1"
  local output="$2"
  shift 2

  (
    cd "$cwd"
    node "$CLI" "$@" > "$output"
  )

  node - "$output" <<'JS'
const fs = require("node:fs");
const file = process.argv[2];
try {
  JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.error(`[FAIL] ${file} is not valid JSON output: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
JS
}

assert_json_path() {
  local file="$1"
  local path="$2"
  local expected="$3"

  node - "$file" "$path" "$expected" <<'JS'
const fs = require("node:fs");
const file = process.argv[2];
const path = process.argv[3];
const expected = process.argv[4];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const result = path.split(".").reduce(
  (state, segment) =>
    state.found && state.value !== undefined && state.value !== null && segment in Object(state.value)
      ? { found: true, value: state.value[segment] }
      : { found: false, value: undefined },
  { found: true, value: data }
);
if (!result.found) {
    console.error(`[FAIL] ${file}: missing JSON path ${path}`);
    process.exit(1);
}
const value = result.value;
const normalized = typeof value === "string" ? value : JSON.stringify(value);
if (normalized !== expected) {
  console.error(`[FAIL] ${file}: expected ${path}=${expected}, got ${normalized}`);
  process.exit(1);
}
JS
}

assert_json_array_min_length() {
  local file="$1"
  local path="$2"
  local min_length="$3"

  node - "$file" "$path" "$min_length" <<'JS'
const fs = require("node:fs");
const file = process.argv[2];
const path = process.argv[3];
const minLength = Number(process.argv[4]);
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const result = path.split(".").reduce(
  (state, segment) =>
    state.found && state.value !== undefined && state.value !== null && segment in Object(state.value)
      ? { found: true, value: state.value[segment] }
      : { found: false, value: undefined },
  { found: true, value: data }
);
if (!result.found) {
    console.error(`[FAIL] ${file}: missing JSON path ${path}`);
    process.exit(1);
}
const value = result.value;
if (!Array.isArray(value) || value.length < minLength) {
  console.error(`[FAIL] ${file}: expected ${path} to contain at least ${minLength} items`);
  process.exit(1);
}
JS
}

quickstart_project="$TMP_DIR/quickstart"
run_json "$TMP_DIR" "$TMP_DIR/init.json" --json init "$quickstart_project" --quickstart
assert_json_path "$TMP_DIR/init.json" initialized true
assert_json_path "$TMP_DIR/init.json" template quickstart

run_json "$quickstart_project" "$TMP_DIR/validate.json" --json validate judge.yaml
assert_json_path "$TMP_DIR/validate.json" summary.failed 0

run_json "$quickstart_project" "$TMP_DIR/expand-root-json.json" --json expand judge.yaml
assert_json_path "$TMP_DIR/expand-root-json.json" workflow quickstart-judge
assert_json_array_min_length "$TMP_DIR/expand-root-json.json" expandedWorkflow.steps 1

run_json "$quickstart_project" "$TMP_DIR/expand-local-json.json" expand --json -- judge.yaml
assert_json_path "$TMP_DIR/expand-local-json.json" workflow quickstart-judge

run_json "$quickstart_project" "$TMP_DIR/run-dry-run.json" --json run judge.yaml --dry-run
assert_json_path "$TMP_DIR/run-dry-run.json" workflow quickstart-judge
assert_json_path "$TMP_DIR/run-dry-run.json" validated true
assert_json_path "$TMP_DIR/run-dry-run.json" overview.nextStep "obora judge"
assert_json_array_min_length "$TMP_DIR/run-dry-run.json" bindingPreview 2
assert_json_array_min_length "$TMP_DIR/run-dry-run.json" outputPreview 1

run_json "$quickstart_project" "$TMP_DIR/judge-dry-run.json" --json judge --dry-run
assert_json_path "$TMP_DIR/judge-dry-run.json" workflow quickstart-judge
assert_json_path "$TMP_DIR/judge-dry-run.json" validated true

run_json "$quickstart_project" "$TMP_DIR/judge-input-file-dry-run.json" --json judge --input @artifacts/submission.json --dry-run
assert_json_path "$TMP_DIR/judge-input-file-dry-run.json" workflow quickstart-judge
assert_json_path "$TMP_DIR/judge-input-file-dry-run.json" validated true

(
  cd "$quickstart_project"
  cat artifacts/submission.json | node "$CLI" --json judge --input @- --dry-run > "$TMP_DIR/judge-stdin-dry-run.json"
)
assert_json_path "$TMP_DIR/judge-stdin-dry-run.json" workflow quickstart-judge
assert_json_path "$TMP_DIR/judge-stdin-dry-run.json" validated true

contract_project="$TMP_DIR/contract-first"
mkdir -p "$contract_project/artifacts"

cat > "$contract_project/artifacts/submission.json" <<'EOF'
{
  "title": "Example submission",
  "body": "The answer is clear and concise."
}
EOF

cat > "$contract_project/artifacts/rubric.json" <<'EOF'
{
  "criteria": ["clarity", "correctness"],
  "scale": "0..1"
}
EOF

cat > "$contract_project/artifacts/result.schema.json" <<'EOF'
{
  "type": "object",
  "required": ["score", "verdict"],
  "properties": {
    "score": { "type": "number" },
    "verdict": { "type": "string" }
  }
}
EOF

cat > "$contract_project/workflow-contract-first.yaml" <<'EOF'
name: contract-first-evaluation
version: "1.0"

agents:
  evaluator:
    provider: openai
    model: gpt-4o-mini

steps:
  - name: evaluate_submission
    agent: evaluator
    input:
      bindings:
        submission:
          path: artifacts/submission.json
          kind: json
        rubric:
          path: artifacts/rubric.json
          kind: json
      task: |
        Evaluate {{submission}} using {{rubric}}.
        Return JSON only.
    output:
      path: artifacts/result.json
      schema: artifacts/result.schema.json
EOF

run_json "$contract_project" "$TMP_DIR/contract-run-dry-run.json" --json run workflow-contract-first.yaml --dry-run
assert_json_path "$TMP_DIR/contract-run-dry-run.json" workflow contract-first-evaluation
assert_json_path "$TMP_DIR/contract-run-dry-run.json" validated true
assert_json_array_min_length "$TMP_DIR/contract-run-dry-run.json" bindingPreview 2
assert_json_array_min_length "$TMP_DIR/contract-run-dry-run.json" outputPreview 1

echo "[PASS] Tutorial CLI flows validate and dry-run with the built CLI."
