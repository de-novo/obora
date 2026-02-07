/**
 * 지정된 시간만큼 대기하는 Promise를 반환합니다.
 * @param ms 대기할 시간(밀리초)
 * @param signal 취소 신호 (optional)
 * @returns Promise<void>
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener("abort", () => {
      clearTimeout(timeoutId);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}
