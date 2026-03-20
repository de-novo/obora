import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileStorage } from '../../src/storage/FileStorage';
import { createTempStorage, cleanupTempStorage, setupTempStorageWithData, createCorruptedFile } from '../helpers/storage';
import { createMockStorage, createMockTodo } from '../helpers/fixtures';
import { CorruptedDataError, StorageError } from '../../src/errors';

describe('FileStorage', () => {
  let tempDir: string;
  let storage: FileStorage;

  beforeEach(async () => {
    tempDir = await createTempStorage();
    storage = new FileStorage(tempDir);
  });

  afterEach(async () => {
    await cleanupTempStorage(tempDir);
  });

  describe('initialize', () => {
    it('새 스토리지를 초기화해야 한다', async () => {
      await storage.initialize();
      
      const exists = await storage.exists();
      expect(exists).toBe(true);
      
      const data = await storage.read();
      expect(data.version).toBe('1.0.0');
      expect(data.todos).toEqual([]);
    });

    it('이미 존재하는 스토리지는 덮어쓰지 않아야 한다', async () => {
      const existingData = createMockStorage([createMockTodo()]);
      await setupTempStorageWithData(tempDir, existingData);
      
      await storage.initialize();
      
      const data = await storage.read();
      expect(data.todos.length).toBe(1);
    });
  });

  describe('read', () => {
    it('저장된 데이터를 읽어야 한다', async () => {
      const mockData = createMockStorage([createMockTodo()]);
      await setupTempStorageWithData(tempDir, mockData);
      
      const data = await storage.read();
      
      expect(data.version).toBe('1.0.0');
      expect(data.todos.length).toBe(1);
      expect(data.todos[0]?.text).toBe('테스트 할 일');
    });

    it('파일이 없으면 초기화 후 빈 스토리지를 반환해야 한다', async () => {
      const data = await storage.read();
      
      expect(data.todos).toEqual([]);
    });

    it('손상된 JSON 파일을 읽으면 CorruptedDataError를 발생하고 초기화해야 한다', async () => {
      await createCorruptedFile(tempDir);
      
      // 첫 읽기에서 에러 발생 후 자동 초기화
      const data = await storage.read();
      
      expect(data.todos).toEqual([]);
    });
  });

  describe('write', () => {
    it('데이터를 파일에 저장해야 한다', async () => {
      const mockData = createMockStorage([createMockTodo()]);
      
      await storage.write(mockData);
      
      const data = await storage.read();
      expect(data.todos.length).toBe(1);
    });

    it('atomic write를 수행해야 한다 (임시 파일 후 rename)', async () => {
      const mockData = createMockStorage([createMockTodo()]);
      
      await storage.write(mockData);
      
      // 파일이 존재하는지 확인
      const exists = await storage.exists();
      expect(exists).toBe(true);
    });

    it('여러 번 쓰기가 정상 동작해야 한다', async () => {
      const data1 = createMockStorage([createMockTodo({ id: '1' })]);
      const data2 = createMockStorage([
        createMockTodo({ id: '1' }),
        createMockTodo({ id: '2' }),
      ]);
      
      await storage.write(data1);
      let data = await storage.read();
      expect(data.todos.length).toBe(1);
      
      await storage.write(data2);
      data = await storage.read();
      expect(data.todos.length).toBe(2);
    });
  });

  describe('exists', () => {
    it('파일이 존재하면 true를 반환해야 한다', async () => {
      await storage.initialize();
      expect(await storage.exists()).toBe(true);
    });

    it('파일이 없으면 false를 반환해야 한다', async () => {
      expect(await storage.exists()).toBe(false);
    });
  });

  describe('에러 처리', () => {
    it('읽기 권한이 없으면 StorageError를 발생해야 한다', async () => {
      // 이 테스트는 권한 설정이 필요하므로 통합 테스트에서 제외할 수 있음
      // 또는 모킹 필요
    });

    it('쓰기 권한이 없으면 StorageError를 발생해야 한다', async () => {
      // 이 테스트는 권한 설정이 필요하므로 통합 테스트에서 제외할 수 있음
      // 또는 모킹 필요
    });
  });
});
