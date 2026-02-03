# TASK-009: 폴더 구조 관리 구현

## 개요
- 우선순위: P0
- 예상 소요: 2시간
- 담당: 개발자

## 목표
피처 폴더 생성, 삭제, 보관 및 상태 추적 관리

## 작업 내용
1. **폴더 구조 모델 정의**
   - `FeatureStructure` 인터페이스 정의
   - 피처 라이프사이클 상태 정의
   - 폴더 경로 상수 정의

2. **폴더 생성 기능**
   - `createFeature(name, options)` 함수 구현
   - 필요한 하위 폴더들 생성
   - 초기 파일들 생성 (빈 파일 또는 템플릿)

3. **폴더 삭제 기능**
   - `deleteFeature(name, options)` 함수 구현
   - `--force` 옵션 시 완전 삭제
   - 기본 동작은 `.obora/archive/`로 이동

4. **보관(archive) 기능**
   - `archiveFeature(name)` 함수 구현
   - `.obora/archive/<date>/<name>/`로 이동
   - 보관 날짜 및 사유 기록

5. **상태 추적**
   - `status.yaml` 파일 관리
   - 상태 전이 관리 (proposed → active → archived)
   - 상태 변경 이력 기록

6. **유효성 검사**
   - 피처 이름 형식 검증
   - 중복 이름 확인
   - 존재하지 않는 피처 확인

## 완료 조건
- [ ] 피처 폴더 생성 가능
- [ ] 피처 폴더 삭제 가능 (보관 포함)
- [ ] 보관 폴더로 이동 가능
- [ ] 상태 추적 및 기록

## 의존성
- TASK-001 (프로젝트 초기 설정)
- TASK-003 (obora init - 폴더 구조)

## 타입 정의 예시
```typescript
interface FeatureStructure {
  name: string;
  path: string;
  status: FeatureStatus;
  createdAt: Date;
  archivedAt?: Date;
}

enum FeatureStatus {
  PROPOSED = 'proposed',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived'
}

interface StatusFile {
  name: string;
  status: FeatureStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  history: StatusHistory[];
}

interface StatusHistory {
  status: FeatureStatus;
  changedAt: string;
  reason?: string;
}

// 폴더 구조 상수
const FOLDER_STRUCTURE = {
  ROOT: '.obora',
  FEATURES: '.obora/features',
  ARCHIVE: '.obora/archive',
  WORKFLOWS: '.obora/workflows'
};

// 피처 하위 파일/폴더 구조 (04-folder-structure.md 기준)
const FEATURE_FILES = [
  'proposal.md',   // 기획서 (필수)
  'design.md',     // 설계서 (필수)
  'tasks.md',      // 작업 목록 (선택)
];

const FEATURE_FOLDERS = [
  'context'        // 에이전트 출력 (자동 생성)
];
```

## API 설계

### 피처 생성
```typescript
function createFeature(
  name: string,
  options: CreateFeatureOptions = {}
): Promise<FeatureStructure> {
  // 1. 이름 유효성 검사
  validateFeatureName(name);

  // 2. 중복 확인
  if (featureExists(name)) {
    throw new Error(`Feature '${name}' already exists`);
  }

  // 3. 폴더 생성
  const featurePath = path.join(FOLDER_STRUCTURE.FEATURES, name);
  fs.mkdirSync(featurePath, { recursive: true });

  // 4. 필수 파일 생성 (템플릿)
  FEATURE_FILES.forEach(file => {
    const template = loadTemplate(file);
    fs.writeFileSync(path.join(featurePath, file), template);
  });

  // 5. context 폴더 생성
  FEATURE_FOLDERS.forEach(folder => {
    fs.mkdirSync(path.join(featurePath, folder));
  });

  // 6. DuckDB에 상태 기록
  await db.insertFeature({
    name,
    status: FeatureStatus.PROPOSED,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    path: featurePath
  });

  return {
    name,
    path: featurePath,
    status: FeatureStatus.PROPOSED,
    createdAt: new Date()
  };
}
```

### 피처 보관
```typescript
function archiveFeature(
  name: string,
  reason?: string
): Promise<FeatureStructure> {
  // 1. 존재 확인
  const featurePath = path.join(FOLDER_STRUCTURE.FEATURES, name);
  if (!fs.existsSync(featurePath)) {
    throw new Error(`Feature '${name}' not found`);
  }

  // 2. 보관 경로 생성
  const dateStr = new Date().toISOString().split('T')[0];
  const archivePath = path.join(
    FOLDER_STRUCTURE.ARCHIVE,
    dateStr,
    name
  );
  fs.mkdirSync(archivePath, { recursive: true });

  // 3. 폴더 이동
  fs.renameSync(featurePath, archivePath);

  // 4. 상태 업데이트
  const status = readStatusFile(archivePath);
  status.status = FeatureStatus.ARCHIVED;
  status.archivedAt = new Date().toISOString();
  status.history.push({
    status: FeatureStatus.ARCHIVED,
    changedAt: new Date().toISOString(),
    reason
  });
  writeStatusFile(archivePath, status);

  return status;
}
```

## 테스트 케이스
```typescript
// 피처 생성
const feature = await createFeature('user-auth');
expect(fs.existsSync(feature.path)).toBe(true);
expect(feature.status).toBe(FeatureStatus.PROPOSED);

// 필수 파일 존재 확인 (04-folder-structure.md 기준)
expect(fs.existsSync(path.join(feature.path, 'proposal.md'))).toBe(true);
expect(fs.existsSync(path.join(feature.path, 'design.md'))).toBe(true);
expect(fs.existsSync(path.join(feature.path, 'context'))).toBe(true);

// 중복 생성 에러
await expect(createFeature('user-auth')).rejects.toThrow();

// 피처 보관
const archived = await archiveFeature('user-auth', '완료됨');
expect(archived.status).toBe(FeatureStatus.ARCHIVED);
expect(archived.archivedAt).toBeDefined();

// 보관 경로 확인 (YYYY-MM 형식)
const archiveDate = new Date().toISOString().slice(0, 7);  // YYYY-MM
const expectedPath = `.obora/archive/${archiveDate}-user-auth`;
expect(fs.existsSync(expectedPath)).toBe(true);
```

## 참고 자료
- [Node.js fs 모듈](https://nodejs.org/api/fs.html)
- [파일 이동 방법 (fs.rename)](https://nodejs.org/api/fs.html#fsrenameoldpath-newpath-callback)
- [라이프사이클 관리 패턴](https://martinfowler.com/articles/lifecycle-management.html)
