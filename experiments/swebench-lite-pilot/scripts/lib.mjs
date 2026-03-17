import fs from "node:fs";
import path from "node:path";

export function fail(message) {
  throw new Error(message);
}

export function resolveInputPath(inputPath) {
  if (!inputPath) {
    fail("Missing file path argument.");
  }

  return path.resolve(process.cwd(), inputPath);
}

export function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

export function readJsonLines(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        fail(`Invalid JSONL at line ${index + 1} in ${filePath}`);
      }
    });
}

export function expectObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
}

export function expectString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} must be a non-empty string.`);
  }
}

export function expectNumber(value, label) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    fail(`${label} must be a number.`);
  }
}

export function expectInteger(value, label) {
  expectNumber(value, label);

  if (!Number.isInteger(value)) {
    fail(`${label} must be an integer.`);
  }
}

export function expectBoolean(value, label) {
  if (typeof value !== "boolean") {
    fail(`${label} must be a boolean.`);
  }
}

export function expectArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array.`);
  }
}

export function expectStringArray(value, label) {
  expectArray(value, label);

  value.forEach((item, index) => {
    expectString(item, `${label}[${index}]`);
  });
}

export function expectNullableString(value, label) {
  if (value !== null) {
    expectString(value, label);
  }
}

export function expectNullableNumber(value, label) {
  if (value !== null) {
    expectNumber(value, label);
  }
}

export function ensureBenchmark(value, label = "benchmark") {
  if (value !== "swe-bench-lite") {
    fail(`${label} must equal swe-bench-lite.`);
  }
}

export function resolveSiblingPath(baseFilePath, relativePath) {
  expectString(relativePath, "relative path");
  return path.resolve(path.dirname(baseFilePath), relativePath);
}

export function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function pathExists(targetPath) {
  return fs.existsSync(targetPath);
}

export function removeIfExists(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

export function sanitizePathComponent(value) {
  expectString(value, "path component");
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function timestampForPath(date = new Date()) {
  const iso = date.toISOString();
  return iso.replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
}

export function average(values) {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

export function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function printOk(message) {
  console.log(`OK: ${message}`);
}
