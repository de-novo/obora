import { describe, it, expect } from 'vitest';
import {
  deepClone,
  deepFreeze,
  immutableUpdate,
  mapToObject,
  objectToMap,
  merge,
} from '../../src/core/immutable';

describe('Immutable Utilities', () => {
  describe('deepClone', () => {
    it('should clone primitive values', () => {
      expect(deepClone(1)).toBe(1);
      expect(deepClone('test')).toBe('test');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBe(null);
      expect(deepClone(undefined)).toBe(undefined);
    });

    it('should clone arrays', () => {
      const arr = [1, 2, 3, { a: 1 }];
      const cloned = deepClone(arr);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[3]).not.toBe(arr[3]);
    });

    it('should clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });

    it('should clone Maps', () => {
      const map = new Map([['key1', { value: 1 }]]);
      const cloned = deepClone(map);

      expect(cloned).toBeInstanceOf(Map);
      expect(cloned.get('key1')).toEqual({ value: 1 });
      expect(cloned.get('key1')).not.toBe(map.get('key1'));
    });

    it('should clone Sets', () => {
      const set = new Set([{ value: 1 }]);
      const cloned = deepClone(set);

      expect(cloned).toBeInstanceOf(Set);
      expect(cloned.size).toBe(1);
    });

    it('should clone Dates', () => {
      const date = new Date('2026-02-06T12:00:00Z');
      const cloned = deepClone(date);

      expect(cloned).toBeInstanceOf(Date);
      expect(cloned.getTime()).toBe(date.getTime());
      expect(cloned).not.toBe(date);
    });

    it('should clone nested structures', () => {
      const nested = {
        arr: [{ a: 1 }, { b: 2 }],
        map: new Map([['key', { nested: 'value' }]]),
        obj: { deep: { deeper: { value: 42 } } },
      };
      const cloned = deepClone(nested);

      expect(cloned).toEqual(nested);
      expect(cloned).not.toBe(nested);
      expect(cloned.arr).not.toBe(nested.arr);
      expect(cloned.map).not.toBe(nested.map);
      expect(cloned.obj).not.toBe(nested.obj);
    });

    it('should throw on circular references', () => {
      const obj: any = { a: 1 };
      obj.self = obj;

      expect(() => deepClone(obj)).toThrow('Circular reference detected');
    });
  });

  describe('deepFreeze', () => {
    it('should freeze objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      deepFreeze(obj);

      expect(Object.isFrozen(obj)).toBe(true);
      expect(Object.isFrozen(obj.b)).toBe(true);
    });

    it('should freeze arrays', () => {
      const arr = [1, 2, { a: 3 }];
      deepFreeze(arr);

      expect(Object.isFrozen(arr)).toBe(true);
      expect(Object.isFrozen(arr[2])).toBe(true);
    });

    it('should freeze nested structures', () => {
      const nested = {
        arr: [{ a: 1 }],
        obj: { deep: { value: 42 } },
      };
      deepFreeze(nested);

      expect(Object.isFrozen(nested)).toBe(true);
      expect(Object.isFrozen(nested.arr)).toBe(true);
      expect(Object.isFrozen(nested.arr[0])).toBe(true);
      expect(Object.isFrozen(nested.obj)).toBe(true);
      expect(Object.isFrozen(nested.obj.deep)).toBe(true);
    });

    it('should prevent modification', () => {
      const obj = { a: 1, b: { c: 2 } };
      deepFreeze(obj);

      expect(() => {
        (obj as any).a = 2;
      }).toThrow();

      expect(() => {
        (obj.b as any).c = 3;
      }).toThrow();
    });

    it('should handle primitive values', () => {
      expect(deepFreeze(1)).toBe(1);
      expect(deepFreeze('test')).toBe('test');
      expect(deepFreeze(null)).toBe(null);
    });
  });

  describe('immutableUpdate', () => {
    it('should update value at path', () => {
      const obj = { a: { b: 1 } };
      const result = immutableUpdate(obj, 'a.b', () => 2);

      expect(result.a.b).toBe(2);
    });

    it('should not mutate original', () => {
      const obj = { a: { b: 1 } };
      immutableUpdate(obj, 'a.b', () => 2);

      expect(obj.a.b).toBe(1);
    });

    it('should create intermediate objects', () => {
      const obj = {};
      const result = immutableUpdate(obj, 'a.b.c', () => 42);

      expect(result.a.b.c).toBe(42);
    });

    it('should pass current value to updater', () => {
      const obj = { count: 5 };
      const result = immutableUpdate(obj, 'count', (v) => (v as number) + 1);

      expect(result.count).toBe(6);
    });

    it('should handle nested updates', () => {
      const obj = {
        users: {
          alice: { age: 25 },
          bob: { age: 30 },
        },
      };
      const result = immutableUpdate(obj, 'users.alice.age', () => 26);

      expect(result.users.alice.age).toBe(26);
      expect(result.users.bob.age).toBe(30);
    });
  });

  describe('mapToObject', () => {
    it('should convert Map to object', () => {
      const map = new Map<string, number>([
        ['a', 1],
        ['b', 2],
      ]);
      const obj = mapToObject(map);

      expect(obj).toEqual({ a: 1, b: 2 });
    });

    it('should handle empty Map', () => {
      const map = new Map<string, number>();
      const obj = mapToObject(map);

      expect(obj).toEqual({});
    });

    it('should preserve values', () => {
      const map = new Map<string, object>([
        ['key', { nested: 'value' }],
      ]);
      const obj = mapToObject(map);

      expect(obj.key).toEqual({ nested: 'value' });
    });
  });

  describe('objectToMap', () => {
    it('should convert object to Map', () => {
      const obj = { a: 1, b: 2 };
      const map = objectToMap(obj);

      expect(map).toBeInstanceOf(Map);
      expect(map.get('a')).toBe(1);
      expect(map.get('b')).toBe(2);
    });

    it('should handle empty object', () => {
      const obj = {};
      const map = objectToMap(obj);

      expect(map.size).toBe(0);
    });

    it('should preserve values', () => {
      const obj = { key: { nested: 'value' } };
      const map = objectToMap(obj);

      expect(map.get('key')).toEqual({ nested: 'value' });
    });
  });

  describe('merge', () => {
    it('should merge objects', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { d: 3 }, e: 4 };
      const merged = merge(target, source);

      expect(merged).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
    });

    it('should not mutate target', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { d: 3 }, e: 4 };
      const targetCopy = JSON.parse(JSON.stringify(target));

      merge(target, source);

      expect(target).toEqual(targetCopy);
    });

    it('should handle multiple sources', () => {
      const target = { a: 1 };
      const source1 = { b: 2 };
      const source2 = { c: 3 };
      const merged = merge(target, source1, source2);

      expect(merged).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should deep merge nested objects', () => {
      const target = { a: { b: { c: 1 } } };
      const source = { a: { b: { d: 2 } } };
      const merged = merge(target, source);

      expect(merged).toEqual({ a: { b: { c: 1, d: 2 } } });
    });

    it('should replace primitives', () => {
      const target = { a: 1 };
      const source = { a: 2 };
      const merged = merge(target, source);

      expect(merged.a).toBe(2);
    });

    it('should handle arrays (replace)', () => {
      const target = { arr: [1, 2] };
      const source = { arr: [3, 4] };
      const merged = merge(target, source);

      expect(merged.arr).toEqual([3, 4]);
    });
  });
});
