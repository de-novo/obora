PROJECT_NAME="obora-kit"
REVIEW_TARGET="all-project checks"
REVIEW_SCOPE="pre-push"

TYPECHECK_CMD="pnpm -r typecheck"
TEST_CMD="pnpm -r test"
BUILD_CMD="pnpm build"
SELFTEST_CMD="bash scripts/review-gate-selftest.sh"
SANDBOX_SMOKE_CMD="bash sandbox/11-longrun-loop/verify.sh && bash sandbox/12-longrun-benchmark-mini/verify.sh && bash sandbox/13-longrun-benchmark-loop/verify.sh && bash sandbox/14-longrun-project-mini/verify.sh && bash sandbox/15-longrun-project-loop/verify.sh && bash sandbox/16-multi-run-comparison-mini/verify.sh && bash sandbox/17-multi-run-comparison-loop/verify.sh && bash sandbox/18-longrun-paper-verification-mini/verify.sh && bash sandbox/19-longrun-paper-verification-loop/verify.sh && bash sandbox/20-longrun-feedback-convergence-loop/verify.sh"

# Flexible model matrix for task-stage auto gate
# MODEL_IDS='opus,codex,glm'
# MODEL_CMD_OPUS='echo {"score":9.1,"p0":0,"p1":0,"summary":"opus ok"}'
# MODEL_CMD_CODEX='echo {"score":9.2,"p0":0,"p1":0,"summary":"codex ok"}'
# MODEL_CMD_GLM='echo {"score":9.0,"p0":0,"p1":0,"summary":"glm ok"}'
# FIX_CMD='git diff --quiet || (git add -A && git commit -m "fix: auto remediation")'
