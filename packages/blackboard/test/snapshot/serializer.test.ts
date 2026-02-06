import { describe, it, expect, beforeEach } from 'vitest';
import {
  StateSerializer,
  calculateChecksumSync,
  verifyChecksumSync,
} from '../../src/snapshot';

describe('StateSerializer', () => {
  let serializer: StateSerializer;

  beforeEach(() => {
    serializer = new StateSerializer();
  });

  describe('serializeJSON()', () => {
    it('should serialize objects to JSON string', () => {
      const obj = { a: 1, b: 'hello' };
      const serialized = serializer.serializeJSON(obj);

      expect(typeof serialized).toBe('string');
      expect(JSON.parse(serialized)).toEqual(obj);
    });

    it('should serialize arrays', () => {
      const arr = [1, 2, 3, { a: 1 }];
      const serialized = serializer.serializeJSON(arr);

      expect(JSON.parse(serialized)).toEqual(arr);
    });

    it('should serialize nested structures', () => {
      const nested = {
        level1: { level2: { value: 42 } },
        arr: [{ a: 1 }, { b: 2 }],
      };
      const serialized = serializer.serializeJSON(nested);

      expect(JSON.parse(serialized)).toEqual(nested);
    });

    it('should serialize Date objects', () => {
      const date = new Date('2026-02-06T12:00:00Z');
      const obj = { date };
      const serialized = serializer.serializeJSON(obj);

      expect(serialized).toContain('2026-02-06');
    });

    it('should serialize Map objects', () => {
      const map = new Map([['key', 'value']]);
      const obj = { map };
      const serialized = serializer.serializeJSON(obj);

      expect(typeof serialized).toBe('string');
    });

    it('should serialize Set objects', () => {
      const set = new Set([1, 2, 3]);
      const obj = { set };
      const serialized = serializer.serializeJSON(obj);

      expect(typeof serialized).toBe('string');
    });
  });

  describe('deserializeJSON()', () => {
    it('should deserialize JSON string to objects', () => {
      const obj = { a: 1, b: 'hello' };
      const serialized = serializer.serializeJSON(obj);
      const deserialized = serializer.deserializeJSON(serialized);

      expect(deserialized).toEqual(obj);
    });

    it('should deserialize arrays', () => {
      const arr = [1, 2, 3];
      const serialized = serializer.serializeJSON(arr);
      const deserialized = serializer.deserializeJSON(serialized);

      expect(deserialized).toEqual(arr);
    });

    it('should throw on invalid JSON', () => {
      expect(() => serializer.deserializeJSON('invalid json')).toThrow();
    });
  });

  describe('roundtrip', () => {
    it('should preserve data through serializeJSON/deserializeJSON', () => {
      const original = {
        string: 'hello',
        number: 42,
        boolean: true,
        nullValue: null,
        array: [1, 2, 3],
        nested: { a: { b: { c: 1 } } },
      };

      const serialized = serializer.serializeJSON(original);
      const deserialized = serializer.deserializeJSON(serialized);

      expect(deserialized).toEqual(original);
    });
  });
});

describe('Checksum utilities', () => {
  describe('calculateChecksumSync()', () => {
    it('should calculate checksum for string', () => {
      const checksum = calculateChecksumSync('test data');

      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);
    });

    it('should return same checksum for same data', () => {
      const data = 'consistent data';
      const checksum1 = calculateChecksumSync(data);
      const checksum2 = calculateChecksumSync(data);

      expect(checksum1).toBe(checksum2);
    });

    it('should return different checksum for different data', () => {
      const checksum1 = calculateChecksumSync('data1');
      const checksum2 = calculateChecksumSync('data2');

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('verifyChecksumSync()', () => {
    it('should verify correct checksum', () => {
      const data = 'test data';
      const checksum = calculateChecksumSync(data);

      expect(verifyChecksumSync(data, checksum)).toBe(true);
    });

    it('should fail for incorrect checksum', () => {
      const data = 'test data';

      expect(verifyChecksumSync(data, 'wrong-checksum')).toBe(false);
    });
  });
});
