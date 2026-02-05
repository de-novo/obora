import { describe, it, expect } from 'vitest';
import {
  getByPath,
  setByPath,
  deleteByPath,
  parsePath,
  isValidPath,
  normalizePath,
  joinPath,
  isSubPath,
  getParentPath,
} from '../../src/core/path-utils';

describe('Path Utils', () => {
  const testObject = {
    a: 1,
    b: {
      c: 2,
      d: {
        e: 3,
      },
    },
    arr: [1, 2, 3],
    nested: {
      arr: [{ x: 1 }, { x: 2 }],
    },
  };

  describe('getByPath', () => {
    it('should get top-level value', () => {
      expect(getByPath(testObject, 'a')).toBe(1);
    });

    it('should get nested value', () => {
      expect(getByPath(testObject, 'b.c')).toBe(2);
      expect(getByPath(testObject, 'b.d.e')).toBe(3);
    });

    it('should get array values by index', () => {
      expect(getByPath(testObject, 'arr.0')).toBe(1);
      expect(getByPath(testObject, 'arr.1')).toBe(2);
      expect(getByPath(testObject, 'nested.arr.0.x')).toBe(1);
    });

    it('should return undefined for non-existent path', () => {
      expect(getByPath(testObject, 'nonexistent')).toBeUndefined();
      expect(getByPath(testObject, 'b.nonexistent')).toBeUndefined();
      expect(getByPath(testObject, 'arr.100')).toBeUndefined();
    });

    it('should return undefined for null parent', () => {
      const obj = { a: null };
      expect(getByPath(obj, 'a.b')).toBeUndefined();
    });

    it('should handle empty path', () => {
      expect(getByPath(testObject, '')).toEqual(testObject);
    });

    it('should handle Map objects', () => {
      const mapObj = { map: new Map([['key', 'value']]) };
      expect(getByPath(mapObj, 'map.key')).toBe('value');
    });
  });

  describe('setByPath', () => {
    it('should set top-level value', () => {
      const result = setByPath({ a: 1 }, 'a', 2);
      expect(result.a).toBe(2);
    });

    it('should set nested value', () => {
      const result = setByPath({ b: { c: 1 } }, 'b.c', 99);
      expect(result.b.c).toBe(99);
    });

    it('should create intermediate objects', () => {
      const result = setByPath({}, 'a.b.c', 42);
      expect(result.a.b.c).toBe(42);
    });

    it('should not mutate original object', () => {
      const original = { a: 1, b: { c: 2 } };
      const result = setByPath(original, 'b.c', 99);
      
      expect(original.b.c).toBe(2);
      expect(result.b.c).toBe(99);
    });

    it('should handle deep nesting', () => {
      const result = setByPath({}, 'a.b.c.d.e.f', 'deep');
      expect(result.a.b.c.d.e.f).toBe('deep');
    });
  });

  describe('deleteByPath', () => {
    it('should delete top-level property', () => {
      const result = deleteByPath({ a: 1, b: 2 }, 'a');
      expect('a' in result).toBe(false);
      expect(result.b).toBe(2);
    });

    it('should delete nested property', () => {
      const result = deleteByPath({ a: { b: { c: 1 } } }, 'a.b.c');
      expect('c' in result.a.b).toBe(false);
    });

    it('should not mutate original object', () => {
      const original = { a: 1, b: 2 };
      deleteByPath(original, 'a');
      
      expect('a' in original).toBe(true);
    });

    it('should return original for non-existent path', () => {
      const original = { a: 1 };
      const result = deleteByPath(original, 'b.c.d');
      
      expect(result).toEqual(original);
    });
  });

  describe('parsePath', () => {
    it('should parse valid paths', () => {
      const result = parsePath('state.phase');
      expect(result.section).toBe('state');
      expect(result.segments).toEqual(['phase']);
      expect(result.full).toBe('state.phase');
    });

    it('should parse paths with multiple segments', () => {
      const result = parsePath('state.context.key1.key2');
      expect(result.section).toBe('state');
      expect(result.segments).toEqual(['context', 'key1', 'key2']);
    });

    it('should parse section-only paths', () => {
      const result = parsePath('knowledge');
      expect(result.section).toBe('knowledge');
      expect(result.segments).toEqual([]);
    });

    it('should parse all valid sections', () => {
      expect(parsePath('meta.version').section).toBe('meta');
      expect(parsePath('state.phase').section).toBe('state');
      expect(parsePath('knowledge.facts').section).toBe('knowledge');
      expect(parsePath('decisions.current').section).toBe('decisions');
    });

    it('should throw for invalid section', () => {
      expect(() => parsePath('invalid.path')).toThrow();
    });

    it('should throw for empty path', () => {
      expect(() => parsePath('')).toThrow();
    });
  });

  describe('isValidPath', () => {
    it('should return true for valid paths', () => {
      expect(isValidPath('state.phase')).toBe(true);
      expect(isValidPath('knowledge.facts')).toBe(true);
      expect(isValidPath('meta')).toBe(true);
    });

    it('should return false for invalid paths', () => {
      expect(isValidPath('invalid.path')).toBe(false);
      expect(isValidPath('')).toBe(false);
    });
  });

  describe('normalizePath', () => {
    it('should remove leading/trailing dots', () => {
      expect(normalizePath('.a.b.')).toBe('a.b');
      expect(normalizePath('...a.b...')).toBe('a.b');
    });

    it('should remove multiple consecutive dots', () => {
      expect(normalizePath('a..b...c')).toBe('a.b.c');
    });

    it('should trim whitespace', () => {
      expect(normalizePath('  a.b  ')).toBe('a.b');
    });

    it('should handle empty string', () => {
      expect(normalizePath('')).toBe('');
      expect(normalizePath('...')).toBe('');
    });
  });

  describe('joinPath', () => {
    it('should join path segments', () => {
      expect(joinPath('a', 'b', 'c')).toBe('a.b.c');
    });

    it('should handle segments with dots', () => {
      expect(joinPath('a.b', 'c.d')).toBe('a.b.c.d');
    });

    it('should filter empty segments', () => {
      expect(joinPath('a', '', 'b')).toBe('a.b');
    });

    it('should normalize each segment', () => {
      expect(joinPath('.a.', '.b.')).toBe('a.b');
    });
  });

  describe('isSubPath', () => {
    it('should return true for child paths', () => {
      expect(isSubPath('state', 'state.phase')).toBe(true);
      expect(isSubPath('state.context', 'state.context.key')).toBe(true);
    });

    it('should return false for same paths', () => {
      expect(isSubPath('state', 'state')).toBe(false);
    });

    it('should return false for non-child paths', () => {
      expect(isSubPath('state', 'knowledge.facts')).toBe(false);
      expect(isSubPath('state.context', 'state.phase')).toBe(false);
    });

    it('should return false for parent paths', () => {
      expect(isSubPath('state.phase', 'state')).toBe(false);
    });
  });

  describe('getParentPath', () => {
    it('should return parent path', () => {
      expect(getParentPath('state.phase')).toBe('state');
      expect(getParentPath('state.context.key')).toBe('state.context');
    });

    it('should return empty for single segment', () => {
      expect(getParentPath('state')).toBe('');
    });

    it('should support multiple levels', () => {
      expect(getParentPath('a.b.c.d', 2)).toBe('a.b');
      expect(getParentPath('a.b.c.d', 3)).toBe('a');
    });

    it('should return empty if levels exceed depth', () => {
      expect(getParentPath('a.b', 5)).toBe('');
    });
  });
});
