/**
 * 지정된 시간만큼 대기하는 Promise를 반환합니다.
 * @param ms 대기할 시간(밀리초)
 * @returns Promise<void>
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
