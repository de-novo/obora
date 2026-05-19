import { execFile } from "node:child_process";

const execFilePromise = (file: string, args: ReadonlyArray<string>): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

export const openWorkflowUrl = (url: string): Promise<void> =>
  process.platform === "darwin"
    ? execFilePromise("open", [url])
    : process.platform === "win32"
      ? execFilePromise("cmd", ["/c", "start", "", url])
      : execFilePromise("xdg-open", [url]);
