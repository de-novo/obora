/**
 * OAuth 콜백 서버
 *
 * 로컬에서 OAuth 콜백을 받기 위한 임시 HTTP 서버입니다.
 */

import { ANTHROPIC_OAUTH_CONFIG } from "./types.ts";

export interface CallbackResult {
  code: string;
  state: string;
}

/**
 * OAuth 콜백을 받기 위한 로컬 서버 시작
 *
 * @param expectedState CSRF 방지를 위한 state 값
 * @param timeoutMs 타임아웃 (기본 5분)
 */
export function startCallbackServer(
  expectedState: string,
  timeoutMs: number = 5 * 60 * 1000
): Promise<{ result: CallbackResult; port: number }> {
  return new Promise((resolve, reject) => {
    let server: ReturnType<typeof Bun.serve> | null = null;
    let timeoutId: Timer | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (server) {
        server.stop();
        server = null;
      }
    };

    // 타임아웃 설정
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("OAuth callback timeout"));
    }, timeoutMs);

    // 사용 가능한 포트 찾기
    const [minPort, maxPort] = ANTHROPIC_OAUTH_CONFIG.redirectPortRange;
    let port = minPort;

    const tryStartServer = () => {
      try {
        server = Bun.serve({
          port,
          fetch(req) {
            const url = new URL(req.url);

            if (url.pathname === "/callback") {
              const code = url.searchParams.get("code");
              const state = url.searchParams.get("state");
              const error = url.searchParams.get("error");
              const errorDescription = url.searchParams.get("error_description");

              // 에러 처리
              if (error) {
                cleanup();
                reject(new Error(`OAuth error: ${error} - ${errorDescription}`));
                return new Response(
                  generateHtmlResponse(false, `Authentication failed: ${errorDescription}`),
                  { headers: { "Content-Type": "text/html" } }
                );
              }

              // State 검증
              if (state !== expectedState) {
                cleanup();
                reject(new Error("Invalid state parameter (possible CSRF attack)"));
                return new Response(
                  generateHtmlResponse(false, "Invalid state parameter"),
                  { headers: { "Content-Type": "text/html" } }
                );
              }

              // 코드 검증
              if (!code) {
                cleanup();
                reject(new Error("No authorization code received"));
                return new Response(
                  generateHtmlResponse(false, "No authorization code received"),
                  { headers: { "Content-Type": "text/html" } }
                );
              }

              // 성공!
              cleanup();
              resolve({
                result: { code, state },
                port,
              });

              return new Response(
                generateHtmlResponse(true, "Authentication successful! You can close this window."),
                { headers: { "Content-Type": "text/html" } }
              );
            }

            return new Response("Not Found", { status: 404 });
          },
        });

        // 서버 시작 성공
      } catch (error) {
        // 포트 사용 중이면 다음 포트 시도
        port++;
        if (port <= maxPort) {
          tryStartServer();
        } else {
          cleanup();
          reject(new Error("No available ports for OAuth callback server"));
        }
      }
    };

    tryStartServer();
  });
}

/**
 * 콜백 페이지 HTML 생성
 */
function generateHtmlResponse(success: boolean, message: string): string {
  const color = success ? "#22c55e" : "#ef4444";
  const icon = success ? "✓" : "✕";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>obora - Authentication</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #0f172a;
      color: #e2e8f0;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .icon {
      font-size: 4rem;
      color: ${color};
      margin-bottom: 1rem;
    }
    .message {
      font-size: 1.25rem;
      margin-bottom: 1rem;
    }
    .hint {
      color: #94a3b8;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <div class="message">${message}</div>
    <div class="hint">You can close this window and return to your terminal.</div>
  </div>
  <script>
    // 3초 후 자동으로 창 닫기 시도
    setTimeout(() => window.close(), 3000);
  </script>
</body>
</html>`;
}

/**
 * 사용 가능한 포트 찾기
 */
export async function findAvailablePort(): Promise<number> {
  const [minPort, maxPort] = ANTHROPIC_OAUTH_CONFIG.redirectPortRange;

  for (let port = minPort; port <= maxPort; port++) {
    try {
      const server = Bun.serve({ port, fetch: () => new Response("") });
      server.stop();
      return port;
    } catch {
      continue;
    }
  }

  throw new Error("No available ports found");
}
