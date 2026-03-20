import { describe, it, expect } from 'vitest';
import { generateId, isValidId } from '../../../src/utils/id';

describe('ID 생성 유틸리티', () => {
  describe('generateId', () => {
    it('유효한 UUID v4 형식을 생성해야 한다', () => {
      const id = generateId();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(id)).toBe(true);
    });

    it('호출할 때마다 다른 ID를 생성해야 한다', () => {
      const id1 = generateId();
      const id2 = generateId();
      const id3 = generateId();
      
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('생성된 ID는 36자여야 한다', () => {
      const id = generateId();
      expect(id.length).toBe(36);
    });

    it('생성된 ID는 소문자여야 한다', () => {
      const id = generateId();
      expect(id).toBe(id.toLowerCase());
    });
  });

  describe('isValidId', () => {
    it('유효한 UUID v4 형식에 대해 true를 반환해야 한다', () => {
      const validIds = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ];

      validIds.forEach(id => {
        expect(isValidId(id)).toBe(true);
      });
    });

    it('잘못된 형식에 대해 false를 반환해야 한다', () => {
      const invalidIds = [
        '',
        'invalid',
        '12345',
        '550e8400-e29b-51d4-a716-446655440000', // version 5 (not 4)
        '550e8400-e29b-41d4-c716-446655440000', // invalid variant
        'gggggggg-gggg-4ggg-8ggg-gggggggggggg', // invalid hex
      ];

      invalidIds.forEach(id => {
        expect(isValidId(id)).toBe(false);
      });
    });

    it('대문자 UUID도 유효하게 처리해야 한다', () => {
      const uppercaseId = '550E8400-E29B-41D4-A716-446655440000';
      expect(isValidId(uppercaseId)).toBe(true);
    });
  });
});
