import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * 임시 스토리지 디렉토리 생성
 */
export async function createTempStorage(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'todo-cli-test-'));
  return tempDir;
}

/**
 * 임시 스토리지 정리
 */
export async function cleanupTempStorage(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

/**
 * 임시 스토리지에 초기 데이터 생성
 */
export async function setupTempStorageWithData(
  tempDir: string,
  data: unknown
): Promise<string> {
  const dataDir = join(tempDir, '.todo-cli');
  await mkdir(dataDir, { recursive: true });
  const filePath = join(dataDir, 'todos.json');
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

/**
 * 손상된 JSON 파일 생성
 */
export async function createCorruptedFile(tempDir: string): Promise<string> {
  const dataDir = join(tempDir, '.todo-cli');
  await mkdir(dataDir, { recursive: true });
  const filePath = join(dataDir, 'todos.json');
  await writeFile(filePath, '{ invalid json }', 'utf-8');
  return filePath;
}
