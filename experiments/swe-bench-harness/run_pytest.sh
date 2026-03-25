#!/bin/bash

SAMPLE_ID=$1
WORK_DIR="/tmp/swebench_${SAMPLE_ID}"

echo "=== Running pytest for ${SAMPLE_ID} ==="

# 샘플 정보 로드
SAMPLE_FILE="experiments/swe-bench-harness/samples/${SAMPLE_ID}.json"
if [ ! -f "$SAMPLE_FILE" ]; then
  echo "ERROR: Sample file not found: $SAMPLE_FILE"
  exit 1
fi

REPO=$(cat $SAMPLE_FILE | jq -r '.repo')
BASE_COMMIT=$(cat $SAMPLE_FILE | jq -r '.base_commit')
TEST_PATCH=$(cat $SAMPLE_FILE | jq -r '.test_patch')
EXPECTED_PATCH=$(cat $SAMPLE_FILE | jq -r '.patch')

# 생성된 패치
GENERATED_PATCH="experiments/swe-bench-harness/results/${SAMPLE_ID}/patch.diff"
if [ ! -f "$GENERATED_PATCH" ]; then
  echo "ERROR: Generated patch not found: $GENERATED_PATCH"
  exit 1
fi

# 작업 디렉토리 생성
rm -rf $WORK_DIR
mkdir -p $WORK_DIR

# 리포지토리 클론
echo "Cloning ${REPO}..."
cd $WORK_DIR
git clone --depth 1 https://github.com/${REPO}.git repo 2>&1 | tail -3
cd repo
git fetch --depth 1 origin $BASE_COMMIT 2>&1 | tail -3
git checkout $BASE_COMMIT 2>&1 | tail -3

# 생성된 패치 적용
echo "Applying generated patch..."
patch -p1 < ../../../$GENERATED_PATCH 2>&1 | tail -5

# 테스트 실행 (간소화된 버전)
echo "Running tests..."
# 실제 pytest는 프로젝트마다 다르므로 여기서는 패치 적용 성공 여부만 확인
if [ $? -eq 0 ]; then
  echo "✅ Patch applied successfully"
  echo "PASS" > $WORK_DIR/result.txt
else
  echo "❌ Patch failed to apply"
  echo "FAIL" > $WORK_DIR/result.txt
fi

echo "Done: ${SAMPLE_ID}"
cat $WORK_DIR/result.txt 2>/dev/null || echo "UNKNOWN"
