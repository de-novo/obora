import { describe, expect, it } from "vitest";
import {
  Compressor,
  calculateChecksumAsync,
  compress,
  decompress,
  detectCompression,
  verifyChecksum,
} from "../compression";

describe("snapshot compression", () => {
  it("compresses and decompresses strings with gzip/base64 defaults", () => {
    const input = JSON.stringify({ message: "release gates are green", repeat: "x".repeat(100) });
    const compressed = compress(input);

    expect(typeof compressed).toBe("string");
    expect(detectCompression(compressed as string)).toBe("gzip");
    expect(decompress(compressed)).toBe(input);
    expect(decompress(compressed, { inputFormat: "base64" })).toBe(input);
  });

  it("preserves data when compression is disabled", () => {
    const text = "plain text";
    const bytes = new Uint8Array([1, 2, 3]);
    const buffer = Buffer.from("buffer");

    expect(compress(text, { level: "none" })).toBe(text);
    expect(decompress(text, { algorithm: "none" })).toBe(text);
    expect(decompress(Buffer.from("raw"), { skipValidation: true })).toEqual(Buffer.from("raw"));
    expect(compress(bytes, { algorithm: "none" })).toBe(bytes);
    expect(compress(buffer, { algorithm: "none" })).toBe(buffer);
  });

  it("supports buffer and uint8array output/input formats", () => {
    const input = "format coverage";
    const base64Compressed = compress(input, { outputFormat: "base64", level: "max" });
    const bufferCompressed = compress(input, { outputFormat: "buffer" });
    const bytesCompressed = compress(input, { outputFormat: "uint8array" });
    const defaultBufferCompressed = compress(Buffer.from(input), { level: "fast" });

    expect(typeof base64Compressed).toBe("string");
    expect(Buffer.isBuffer(bufferCompressed)).toBe(true);
    expect(Buffer.isBuffer(defaultBufferCompressed)).toBe(true);
    expect(bytesCompressed).toBeInstanceOf(Uint8Array);
    expect(decompress(base64Compressed)).toBe(input);
    expect(decompress(bufferCompressed, { inputFormat: "buffer" })).toEqual(Buffer.from(input));
    expect(decompress(defaultBufferCompressed)).toEqual(Buffer.from(input));
    expect(decompress(bytesCompressed, { inputFormat: "uint8array" })).toEqual(
      new TextEncoder().encode(input)
    );
  });

  it("handles empty values and rejects invalid inputs", () => {
    expect(decompress("")).toBe("");
    expect(decompress(Buffer.alloc(0))).toEqual(Buffer.alloc(0));
    expect(decompress(new Uint8Array())).toEqual(new Uint8Array());

    expect(() => compress(null as unknown as string)).toThrow("must not be null or undefined");
    expect(() => decompress(undefined as unknown as string)).toThrow(
      "must not be null or undefined"
    );
    expect(decompress("plain-not-gzip")).toBe("plain-not-gzip");
    expect(() => decompress(new Uint8Array([1, 2, 3]))).toThrow("Failed to decompress data");
    expect(detectCompression("")).toBeNull();
    expect(detectCompression("not-base64")).toBeNull();
  });

  it("calculates and verifies checksums", async () => {
    const checksum = await calculateChecksumAsync("payload");

    await expect(verifyChecksum("payload", checksum)).resolves.toBe(true);
    await expect(verifyChecksum("other", checksum)).resolves.toBe(false);
  });
});

describe("Compressor", () => {
  it("tracks compression history and supports async methods", async () => {
    const compressor = new Compressor({ level: "fast" });

    const compressed = compressor.compress("payload");
    expect(compressor.decompress(compressed)).toBe("payload");
    await expect(compressor.compressAsync("async payload")).resolves.toBeInstanceOf(Uint8Array);
    await expect(compressor.decompressAsync(compressed)).resolves.toBe("payload");

    expect(compressor.getHistory()).toHaveLength(2);
    compressor.clearHistory();
    expect(compressor.getHistory()).toEqual([]);
  });

  it("supports store-level no-compression and explicit metadata defaults", () => {
    const rawCompressor = new Compressor({ algorithm: "none", level: "none" });
    const raw = rawCompressor.compress("raw payload");
    expect(rawCompressor.decompress(raw)).toBe("raw payload");

    const metaCompressor = new Compressor({ algorithm: "gzip", level: "max" });
    const withMeta = metaCompressor.compressWithMeta("metadata defaults");
    expect(withMeta.metadata).toMatchObject({
      algorithm: "gzip",
      level: "max",
    });
    expect(metaCompressor.decompressWithMeta(withMeta)).toBe("metadata defaults");
  });

  it("calculates ratios and stats for edge cases", () => {
    const compressor = new Compressor();

    expect(compressor.ratio(0, 0)).toBe(1);
    expect(compressor.ratio(10, 0)).toBe(Infinity);
    expect(compressor.stats(100, 40)).toMatchObject({
      originalSize: 100,
      compressedSize: 40,
      ratio: 2.5,
      savings: 60,
      savingsPercent: 60,
    });
    expect(compressor.stats(0, 10).savingsPercent).toBe(0);
  });

  it("round-trips metadata bundles and exposes options", () => {
    const compressor = new Compressor({ includeMetadata: true });

    const withMeta = compressor.compressWithMeta("with metadata");
    expect(withMeta.metadata).toMatchObject({
      originalSize: "with metadata".length,
      algorithm: "gzip",
    });
    expect(compressor.decompressWithMeta(withMeta)).toBe("with metadata");
    expect(compressor.decompressWithMeta(withMeta.data)).toBe("with metadata");

    compressor.setOptions({ algorithm: "none" });
    expect(compressor.getOptions().algorithm).toBe("none");
    const raw = compressor.compress("raw");
    expect(compressor.decompress(raw)).toBe("raw");
  });

  it("ignores malformed metadata when bundled compressed data is intact", () => {
    const compressor = new Compressor();
    const withMeta = compressor.compressWithMeta("bad metadata");
    const combined = Buffer.from(withMeta.data, "base64");
    const metaLength = combined.readUInt32BE(0);

    combined.fill(0xff, 4, 4 + metaLength);

    expect(compressor.decompressWithMeta(combined.toString("base64"))).toBe("bad metadata");
  });
});
