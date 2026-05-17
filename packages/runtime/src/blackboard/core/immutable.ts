/**
 * @module immutable
 * @description 딥 클론 및 불변성 유틸리티
 */

const isMergeableRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof Map) &&
  !(value instanceof Set);

/**
 * 깊은 복사
 * @param obj - 복사할 객체
 * @param cloneMap - 순환 참조 추적용 WeakMap (낮은용)
 * @returns 깊은 복사본
 */
export function deepClone<T>(obj: T, cloneMap = new WeakMap<object, object>()): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // 순환 참조 감지 - 이미 복사한 객체가 있으면 해당 복사본 반환
  if (cloneMap.has(obj as object)) {
    return cloneMap.get(obj as object) as T;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (obj instanceof Map) {
    const clonedMap = new Map();
    cloneMap.set(obj as object, clonedMap);
    Array.from(obj.entries()).forEach(([key, value]) => {
      clonedMap.set(deepClone(key, cloneMap), deepClone(value, cloneMap));
    });
    return clonedMap as T;
  }

  if (obj instanceof Set) {
    const clonedSet = new Set();
    cloneMap.set(obj as object, clonedSet);
    Array.from(obj.values()).forEach((value) => {
      clonedSet.add(deepClone(value, cloneMap));
    });
    return clonedSet as T;
  }

  if (Array.isArray(obj)) {
    const clonedArray: unknown[] = [];
    cloneMap.set(obj as object, clonedArray);
    clonedArray.push(...obj.map((item) => deepClone(item, cloneMap)));
    return clonedArray as T;
  }

  // 일반 객체
  const clonedObj = {} as T;
  cloneMap.set(obj as object, clonedObj as object);
  Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
    (clonedObj as Record<string, unknown>)[key] = deepClone(value, cloneMap);
  });
  return clonedObj;
}

/**
 * 깊은 동결 (불변 객체 생성)
 * @param obj - 동결할 객체
 * @returns 동결된 객체
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== "object") {
    return obj as Readonly<T>;
  }

  Object.freeze(obj);

  const propNames = Object.getOwnPropertyNames(obj);

  propNames.forEach((name) => {
    const value = (obj as Record<string, unknown>)[name];
    if (value !== null && typeof value === "object") {
      deepFreeze(value);
    }
  });

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
export function immutableUpdate<T>(obj: T, path: string, updater: (value: unknown) => unknown): T {
  const segments = path.split(".");
  const childAt = (current: unknown, segment: string): unknown =>
    current !== null && typeof current === "object"
      ? (current as Record<string, unknown>)[segment]
      : undefined;
  const assignAt = (current: unknown, segment: string, value: unknown): unknown => {
    const next = current !== null && typeof current === "object" ? deepClone(current) : {};
    (next as Record<string, unknown>)[segment] = value;
    return next;
  };
  const updateAt = (current: unknown, [segment, ...rest]: ReadonlyArray<string>): unknown =>
    segment === undefined
      ? updater(current)
      : assignAt(
          current,
          segment,
          rest.length === 0 ? updater(childAt(current, segment)) : updateAt(childAt(current, segment), rest)
        );

  return updateAt(obj, segments) as T;
}

/**
 * Map을 일반 객체로 변환
 * @param map - 변환할 Map
 * @returns 일반 객체
 */
export function mapToObject<K extends string, V>(map: Map<K, V>): Record<K, V> {
  return Object.fromEntries(map.entries()) as Record<K, V>;
}

/**
 * 일반 객체를 Map으로 변환
 * @param obj - 변환할 객체
 * @returns Map
 */
export function objectToMap<K extends string, V>(obj: Record<K, V>): Map<K, V> {
  return new Map(Object.entries(obj) as [K, V][]);
}

/**
 * 객체 병합 (불변)
 * @param target - 대상 객체
 * @param sources - 병합할 소스들
 * @returns 병합된 새 객체
 */
export function merge<T extends Record<string, unknown>>(target: T, ...sources: Partial<T>[]): T {
  const mergeValue = (existingValue: unknown, value: unknown): unknown =>
    isMergeableRecord(value) && isMergeableRecord(existingValue)
      ? merge(existingValue, value)
      : value !== null && typeof value === "object"
        ? deepClone(value)
        : value;

  return sources.reduce<T>(
    (result, source) =>
      Object.entries(source).reduce<T>(
        (current, [key, value]) =>
          ({
            ...current,
            [key]: mergeValue((current as Record<string, unknown>)[key], value),
          }) as T,
        result
      ),
    deepClone(target)
  );
}
