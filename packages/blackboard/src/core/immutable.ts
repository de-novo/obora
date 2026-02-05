/**
 * @module immutable
 * @description 딥 클론 및 불변성 유틸리티
 */

/**
 * 깊은 복사
 * @param obj - 복사할 객체
 * @param seen - 순환 참조 추적용 WeakSet (내부용)
 * @returns 깊은 복사본
 */
export function deepClone<T>(obj: T, seen = new WeakSet<object>()): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // 순환 참조 감지
  if (seen.has(obj as object)) {
    throw new Error('Circular reference detected');
  }
  seen.add(obj as object);

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (obj instanceof Map) {
    const clonedMap = new Map();
    for (const [key, value] of obj.entries()) {
      clonedMap.set(deepClone(key, seen), deepClone(value, seen));
    }
    return clonedMap as T;
  }

  if (obj instanceof Set) {
    const clonedSet = new Set();
    for (const value of obj) {
      clonedSet.add(deepClone(value, seen));
    }
    return clonedSet as T;
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item, seen)) as T;
  }

  // 일반 객체
  const clonedObj = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      (clonedObj as Record<string, unknown>)[key] = deepClone(
        (obj as Record<string, unknown>)[key],
        seen
      );
    }
  }
  return clonedObj;
}

/**
 * 깊은 동결 (불변 객체 생성)
 * @param obj - 동결할 객체
 * @returns 동결된 객체
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj as Readonly<T>;
  }

  Object.freeze(obj);

  const propNames = Object.getOwnPropertyNames(obj);

  for (const name of propNames) {
    const value = (obj as Record<string, unknown>)[name];
    if (value !== null && typeof value === 'object') {
      deepFreeze(value);
    }
  }

  return obj as Readonly<T>;
}

/**
 * 불변 업데이트
 * @description 중첩된 객체를 불변성을 유지하며 업데이트
 * @param obj - 원본 객체
 * @param path - 업데이트할 경로
 * @param updater - 업데이트 함수
 * @returns 새 객체
 */
export function immutableUpdate<T>(
  obj: T,
  path: string,
  updater: (value: unknown) => unknown
): T {
  const segments = path.split('.');
  const newObj = deepClone(obj);

  let current: Record<string, unknown> = newObj as Record<string, unknown>;
  const pathStack: string[] = [];

  // 해당 경로까지 이동
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    pathStack.push(segment);

    if (!(segment in current)) {
      (current[segment] as Record<string, unknown>) = {};
    } else {
      // 불변성 유지를 위해 복사
      current[segment] = deepClone(current[segment]);
    }
    current = current[segment] as Record<string, unknown>;
  }

  // 마지막 경로에 업데이트
  const lastSegment = segments[segments.length - 1];
  current[lastSegment] = updater(current[lastSegment]);

  return newObj;
}

/**
 * Map을 일반 객체로 변환
 * @param map - 변환할 Map
 * @returns 일반 객체
 */
export function mapToObject<K extends string, V>(
  map: Map<K, V>
): Record<K, V> {
  const obj = {} as Record<K, V>;
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

/**
 * 일반 객체를 Map으로 변환
 * @param obj - 변환할 객체
 * @returns Map
 */
export function objectToMap<K extends string, V>(
  obj: Record<K, V>
): Map<K, V> {
  return new Map(Object.entries(obj) as [K, V][]);
}

/**
 * 객체 병합 (불변)
 * @param target - 대상 객체
 * @param sources - 병합할 소스들
 * @returns 병합된 새 객체
 */
export function merge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  const result = deepClone(target);

  for (const source of sources) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const value = source[key];
        if (value !== null && typeof value === 'object') {
          const existingValue = (result as Record<string, unknown>)[key];
          if (existingValue !== null && typeof existingValue === 'object') {
            (result as Record<string, unknown>)[key] = merge(
              existingValue as Record<string, unknown>,
              value as Record<string, unknown>
            );
          } else {
            (result as Record<string, unknown>)[key] = deepClone(value);
          }
        } else {
          (result as Record<string, unknown>)[key] = value;
        }
      }
    }
  }

  return result;
}
