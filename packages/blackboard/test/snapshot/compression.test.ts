import { describe, it, expect, beforeEach } from 'vitest';
import {
  compress,
  decompress,
  Compressor,
  type CompressionOptions,
  type CompressionLevel,
} from '../../src/snapshot/compression';

describe('Compression', () => {
  describe('compress()', () => {
    it('should compress string data', () => {
      const data = 'Hello, World!'.repeat(100);
      const compressed = compress(data);
      
      expect(compressed.length).toBeLessThan(data.length);
    });

    it('should compress Buffer data', () => {
      const data = Buffer.from('Hello, World!'.repeat(100));
      const compressed = compress(data);
      
      expect(compressed.length).toBeLessThan(data.length);
    });

    it('should handle empty data', () => {
      const data = '';
      const compressed = compress(data);
      
      expect(compressed).toBeDefined();
      expect(compressed.length).toBeGreaterThan(0);
    });

    it('should handle small data', () => {
      const data = 'Hi';
      const compressed = compress(data);
      
      expect(compressed).toBeDefined();
    });

    it('should compress with different levels', () => {
      const data = 'Hello, World!'.repeat(1000);
      
      const fast = compress(data, { level: 'fast' });
      const balanced = compress(data, { level: 'balanced' });
      const max = compress(data, { level: 'max' });
      
      // All should be smaller than original
      expect(fast.length).toBeLessThan(data.length);
      expect(balanced.length).toBeLessThan(data.length);
      expect(max.length).toBeLessThan(data.length);
      
      // Max should be smallest (usually)
      expect(max.length).toBeLessThanOrEqual(balanced.length);
    });

    it('should return base64 when requested', () => {
      const data = 'Hello, World!'.repeat(100);
      const compressed = compress(data, { outputFormat: 'base64' });
      
      expect(typeof compressed).toBe('string');
      // Valid base64 check
      expect(() => Buffer.from(compressed as string, 'base64')).not.toThrow();
    });
  });

  describe('decompress()', () => {
    it('should decompress to original data', () => {
      const original = 'Hello, World!'.repeat(100);
      const compressed = compress(original);
      const decompressed = decompress(compressed);
      
      expect(decompressed.toString()).toBe(original);
    });

    it('should decompress Buffer data', () => {
      const original = Buffer.from('Hello, World!'.repeat(100));
      const compressed = compress(original);
      const decompressed = decompress(compressed);
      
      expect(Buffer.compare(decompressed as Buffer, original)).toBe(0);
    });

    it('should decompress base64 data', () => {
      const original = 'Hello, World!'.repeat(100);
      const compressed = compress(original, { outputFormat: 'base64' });
      const decompressed = decompress(compressed, { inputFormat: 'base64' });
      
      expect(decompressed.toString()).toBe(original);
    });

    it('should handle empty compressed data', () => {
      const original = '';
      const compressed = compress(original);
      const decompressed = decompress(compressed);
      
      expect(decompressed.toString()).toBe(original);
    });

    it('should throw on invalid compressed data', () => {
      expect(() => decompress(Buffer.from('invalid data'))).toThrow();
    });
  });

  describe('Compressor class', () => {
    let compressor: Compressor;

    beforeEach(() => {
      compressor = new Compressor();
    });

    it('should create with default options', () => {
      expect(compressor).toBeDefined();
    });

    it('should create with custom options', () => {
      const custom = new Compressor({ level: 'max' });
      expect(custom).toBeDefined();
    });

    it('should compress and decompress roundtrip', () => {
      const original = 'Test data for compression'.repeat(50);
      
      const compressed = compressor.compress(original);
      const decompressed = compressor.decompress(compressed);
      
      expect(decompressed.toString()).toBe(original);
    });

    it('should calculate compression ratio', () => {
      const original = 'Hello, World!'.repeat(1000);
      const compressed = compressor.compress(original);
      const ratio = compressor.ratio(original.length, compressed.length);
      
      expect(ratio).toBeGreaterThan(1); // Should be > 1 (compressed is smaller)
    });

    it('should report stats', () => {
      const original = 'Hello, World!'.repeat(100);
      const compressed = compressor.compress(original);
      const stats = compressor.stats(original.length, compressed.length);
      
      expect(stats.originalSize).toBe(original.length);
      expect(stats.compressedSize).toBe(compressed.length);
      expect(stats.ratio).toBeGreaterThan(1);
      expect(stats.savings).toBeGreaterThan(0);
    });
  });

  describe('Compression levels', () => {
    const levels: CompressionLevel[] = ['none', 'fast', 'balanced', 'max'];

    levels.forEach(level => {
      it(`should handle level: ${level}`, () => {
        const original = 'Test data'.repeat(100);
        const compressed = compress(original, { level });
        const decompressed = decompress(compressed);
        
        expect(decompressed.toString()).toBe(original);
      });
    });

    it('should not compress with level: none', () => {
      const original = 'Test data'.repeat(100);
      const compressed = compress(original, { level: 'none' });
      
      // With no compression, size should be similar
      expect(Math.abs(compressed.length - original.length)).toBeLessThan(50);
    });
  });

  describe('Large data handling', () => {
    it('should handle large data efficiently', () => {
      // 1MB of data
      const largeData = 'x'.repeat(1024 * 1024);
      
      const startTime = Date.now();
      const compressed = compress(largeData);
      const compressTime = Date.now() - startTime;
      
      const decompressStart = Date.now();
      const decompressed = decompress(compressed);
      const decompressTime = Date.now() - decompressStart;
      
      expect(decompressed.toString()).toBe(largeData);
      expect(compressTime).toBeLessThan(5000); // Should be under 5s
      expect(decompressTime).toBeLessThan(5000);
    });

    it('should handle highly compressible data', () => {
      // Highly repetitive = highly compressible
      const repetitive = 'AAAA'.repeat(100000);
      const compressed = compress(repetitive);
      
      const ratio = repetitive.length / compressed.length;
      expect(ratio).toBeGreaterThan(10); // Should be very compressible
    });

    it('should handle random data', () => {
      // Random data is less compressible
      const random = Array.from({ length: 10000 }, () => 
        String.fromCharCode(Math.floor(Math.random() * 256))
      ).join('');
      
      const compressed = compress(random);
      const decompressed = decompress(compressed);
      
      expect(decompressed.toString()).toBe(random);
    });
  });

  describe('JSON compression', () => {
    it('should compress JSON objects efficiently', () => {
      const obj = {
        users: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          role: i % 2 === 0 ? 'admin' : 'user',
        })),
        metadata: {
          createdAt: new Date().toISOString(),
          version: 1,
        },
      };
      
      const json = JSON.stringify(obj);
      const compressed = compress(json);
      const decompressed = decompress(compressed);
      const parsed = JSON.parse(decompressed.toString());
      
      expect(parsed).toEqual(obj);
      expect(compressed.length).toBeLessThan(json.length);
    });

    it('should compress nested structures', () => {
      const nested = {
        level1: {
          level2: {
            level3: {
              level4: {
                data: 'deep nested value'.repeat(100),
              },
            },
          },
        },
      };
      
      const json = JSON.stringify(nested);
      const compressed = compress(json);
      const decompressed = decompress(compressed);
      
      expect(JSON.parse(decompressed.toString())).toEqual(nested);
    });
  });

  describe('Error handling', () => {
    it('should throw on null input', () => {
      expect(() => compress(null as any)).toThrow();
    });

    it('should throw on undefined input', () => {
      expect(() => compress(undefined as any)).toThrow();
    });

    it('should throw on invalid input type', () => {
      expect(() => compress(123 as any)).toThrow();
    });

    it('should throw on corrupted compressed data', () => {
      const original = 'Hello, World!';
      const compressed = compress(original);
      
      // Corrupt the data
      if (Buffer.isBuffer(compressed)) {
        compressed[5] = 255;
        compressed[6] = 255;
      }
      
      expect(() => decompress(compressed)).toThrow();
    });
  });

  describe('Stream compression (if supported)', () => {
    it('should compress using streams for large data', async () => {
      const compressor = new Compressor({ level: 'balanced' });
      const largeData = 'Stream test data '.repeat(10000);
      
      const compressed = await compressor.compressAsync(largeData);
      const decompressed = await compressor.decompressAsync(compressed);
      
      expect(decompressed.toString()).toBe(largeData);
    });
  });

  describe('Compression metadata', () => {
    it('should include metadata in compressed output', () => {
      const compressor = new Compressor({ includeMetadata: true });
      const original = 'Test data'.repeat(100);
      
      const result = compressor.compressWithMeta(original);
      
      expect(result.metadata).toBeDefined();
      expect(result.metadata.originalSize).toBe(original.length);
      expect(result.metadata.compressedSize).toBeDefined();
      expect(result.metadata.algorithm).toBeDefined();
    });

    it('should decompress using metadata', () => {
      const compressor = new Compressor({ includeMetadata: true });
      const original = 'Test data'.repeat(100);
      
      const result = compressor.compressWithMeta(original);
      const decompressed = compressor.decompressWithMeta(result);
      
      expect(decompressed.toString()).toBe(original);
    });
  });
});
