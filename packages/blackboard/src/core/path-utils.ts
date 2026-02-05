/**
 * @module path-utils
 * @description 경로 유틸리티
 */

/**
 * 경로 파싱 결과
 */
export interface ParsedPath {
  /** 섹션 (meta, state, knowledge, decisions) */
  section: 'meta' | 'state' | 'knowledge' | 'decisions';
  /** 나머지 경로 세그먼트 */
  segments: string[];
  /** 전체 경로 */
  full: string;
}

/**
 * 유효한 섹션 이름들
 */
const VALID_SECTIONS = ['meta', 'state', 'knowledge', 'decisions'] as const;

/**
 * 섹션인지 확인
 */
function isValidSection(section: string): section is typeof VALID_SECTIONS[number] {
  return VALID_SECTIONS.includes(section as typeof VALID_SECTIONS[number]);
}

/**
 * 경로 기반 값 접근
 * @param obj - 대상 객체
 * @param path - 점(.)으로 구분된 경로
 * @returns 해당 경로의 값
 */
export function getByPath<T = unknown>(obj: unknown, path: string): T | undefined {
  if (typeof obj !== 'object' || obj === null) {
    return undefined;
  }

  const segments = path.split('.').filter(Boolean);

  if (segments.length === 0) {
    return obj as T;
  }

  let current: unknown = obj;

  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    // Map 처리
    if (current instanceof Map) {
      current = current.get(segment);
      continue;
    }

    // 배열 처리 (숫자 인덱스)
    if (Array.isArray(current)) {
      const index = parseInt(segment, 10);
      if (!isNaN(index) && index >= 0 && index < current.length) {
        current = current[index];
        continue;
      }
      return undefined;
    }

    // 일반 객체
    if (!(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current as T;
}

/**
 * 경로 기반 값 설정 (불변)
 * @param obj - 대상 객체
 * @param path - 점(.)으로 구분된 경로
 * @param value - 설정할 값
 * @returns 수정된 객체 (불변성 유지)
 */
export function setByPath<T>(obj: T, path: string, value: unknown): T {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const segments = path.split('.').filter(Boolean);

  if (segments.length === 0) {
    return value as T;
  }

  const newObj = deepClone(obj) as Record<string, unknown>;

  let current: Record<string, unknown> = newObj;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];

    if (!(segment in current)) {
      current[segment] = {};
    } else {
      current[segment] = deepClone(current[segment]);
    }

    if (typeof current[segment] !== 'object' || current[segment] === null) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
  }

  const lastSegment = segments[segments.length - 1];
  current[lastSegment] = deepClone(value);

  return newObj as T;
}

/**
 * 깊은 복사 (내부 유틸리티)
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (obj instanceof Map) {
    const clonedMap = new Map();
    for (const [key, value] of obj.entries()) {
      clonedMap.set(deepClone(key), deepClone(value));
    }
    return clonedMap as T;
  }

  if (obj instanceof Set) {
    const clonedSet = new Set();
    for (const value of obj) {
      clonedSet.add(deepClone(value));
    }
    return clonedSet as T;
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as T;
  }

  const clonedObj = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      (clonedObj as Record<string, unknown>)[key] = deepClone(
        (obj as Record<string, unknown>)[key]
      );
    }
  }
  return clonedObj;
}

/**
 * 경로 기반 값 삭제
 * @param obj - 대상 객체
 * @param path - 점(.)으로 구분된 경로
 * @returns 수정된 객체 (불변성 유지)
 */
export function deleteByPath<T>(obj: T, path: string): T {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const segments = path.split('.').filter(Boolean);

  if (segments.length === 0) {
    return obj;
  }

  const newObj = deepClone(obj) as Record<string, unknown>;

  // 단일 세그먼트인 경우 바로 삭제
  if (segments.length === 1) {
    delete newObj[segments[0]];
    return newObj as T;
  }

  let current: Record<string, unknown> = newObj;

  // 마지막 전까지 이동
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];

    if (!(segment in current)) {
      return obj; // 경로가 존재하지 않으면 원본 반환
    }

    current[segment] = deepClone(current[segment]);

    if (typeof current[segment] !== 'object' || current[segment] === null) {
      return obj;
    }

    current = current[segment] as Record<string, unknown>;
  }

  const lastSegment = segments[segments.length - 1];
  delete current[lastSegment];

  return newObj as T;
}

/**
 * 경로 파싱
 * @param path - 전체 경로
 * @returns 파싱된 경로 정보
 */
export function parsePath(path: string): ParsedPath {
  const normalized = normalizePath(path);
  const segments = normalized.split('.').filter(Boolean);

  if (segments.length === 0) {
    throw new Error(`Invalid path: ${path}`);
  }

  const section = segments[0];

  if (!isValidSection(section)) {
    throw new Error(`Invalid section: ${section}. Valid sections: ${VALID_SECTIONS.join(', ')}`);
  }

  return {
    section,
    segments: segments.slice(1),
    full: normalized,
  };
}

/**
 * 경로 검증
 * @param path - 검증할 경로
 * @returns 유효 여부
 */
export function isValidPath(path: string): boolean {
  try {
    const parsed = parsePath(path);
    return parsed.section !== undefined;
  } catch {
    return false;
  }
}

/**
 * 경로 정규화
 * @param path - 정규화할 경로
 * @returns 정규화된 경로
 */
export function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/\s+/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

/**
 * 경로 결합
 * @param parts - 결합할 경로들
 * @returns 결합된 경로
 */
export function joinPath(...parts: string[]): string {
  return parts
    .map(p => normalizePath(p))
    .filter(Boolean)
    .join('.');
}

/**
 * 경로가 다른 경로의 하위 경로인지 확인
 * @param parent - 부모 경로
 * @param child - 자식 경로
 * @returns 하위 경로 여부
 */
export function isSubPath(parent: string, child: string): boolean {
  const normalizedParent = normalizePath(parent);
  const normalizedChild = normalizePath(child);

  if (normalizedParent === normalizedChild) {
    return false;
  }

  return normalizedChild.startsWith(normalizedParent + '.');
}

/**
 * 경로의 상위 경로 반환
 * @param path - 경로
 * @param levels - 올라갈 레벨 수 (기본: 1)
 * @returns 상위 경로
 */
export function getParentPath(path: string, levels: number = 1): string {
  const normalized = normalizePath(path);
  const segments = normalized.split('.').filter(Boolean);

  if (segments.length <= levels) {
    return '';
  }

  return segments.slice(0, segments.length - levels).join('.');
}
