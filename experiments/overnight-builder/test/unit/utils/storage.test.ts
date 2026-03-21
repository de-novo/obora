import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTaskFilePath, getTaskDirPath, ensureTaskDir } from '../../../src/utils/storage';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Storage Utils', () => {
  const originalHome = process.env.HOME;
  const testHomeDir = '/tmp/test-home';

  beforeEach(() => {
    process.env.HOME = testHomeDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
  });

  describe('getTaskDirPath', () => {
    it('should return correct task directory path', () => {
      const dirPath = getTaskDirPath();
      expect(dirPath).toBe(path.join(testHomeDir, '.taskmaster'));
    });

    it('should use HOME environment variable', () => {
      process.env.HOME = '/custom/home';
      const dirPath = getTaskDirPath();
      expect(dirPath).toBe(path.join('/custom/home', '.taskmaster'));
    });

    it('should be platform-independent', () => {
      const dirPath = getTaskDirPath();
      expect(dirPath).toContain('.taskmaster');
    });
  });

  describe('getTaskFilePath', () => {
    it('should return correct task file path', () => {
      const filePath = getTaskFilePath();
      expect(filePath).toBe(path.join(testHomeDir, '.taskmaster', 'tasks.json'));
    });

    it('should include tasks.json filename', () => {
      const filePath = getTaskFilePath();
      expect(filePath).toMatch(/tasks\.json$/);
    });

    it('should be inside taskmaster directory', () => {
      const filePath = getTaskFilePath();
      const dirPath = getTaskDirPath();
      expect(filePath.startsWith(dirPath)).toBe(true);
    });
  });

  describe('ensureTaskDir', () => {
    let mkdirSyncSpy: any;
    let existsSyncSpy: any;

    beforeEach(() => {
      mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
      existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should create directory if it does not exist', () => {
      ensureTaskDir();
      expect(mkdirSyncSpy).toHaveBeenCalledWith(
        getTaskDirPath(),
        { recursive: true }
      );
    });

    it('should not create directory if it exists', () => {
      existsSyncSpy.mockReturnValue(true);
      ensureTaskDir();
      expect(mkdirSyncSpy).not.toHaveBeenCalled();
    });

    it('should create directory with recursive option', () => {
      ensureTaskDir();
      const callArgs = mkdirSyncSpy.mock.calls[0];
      expect(callArgs[1]).toEqual({ recursive: true });
    });

    it('should handle errors gracefully', () => {
      const error = new Error('Permission denied');
      mkdirSyncSpy.mockImplementation(() => {
        throw error;
      });

      expect(() => ensureTaskDir()).toThrow();
    });
  });

  describe('Cross-platform compatibility', () => {
    it('should work on Windows-style paths', () => {
      // Mock Windows environment
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const filePath = getTaskFilePath();
      expect(filePath).toContain('.taskmaster');
      expect(filePath).toContain('tasks.json');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should work on Unix-style paths', () => {
      // Mock Unix environment
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const filePath = getTaskFilePath();
      expect(filePath).toContain('.taskmaster');
      expect(filePath).toContain('tasks.json');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });
});
