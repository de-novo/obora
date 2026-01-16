/**
 * Orchestrator Module
 *
 * SDK 기반 워크플로우 오케스트레이터
 * - .claude/agents/*.md 에서 에이전트 동적 로드
 * - .claude/rules/*.md 는 Claude Code가 자동 인식
 * - 중앙 DB에 워크플로우 추적
 * - SaaS 확장을 위한 이벤트 소싱
 *
 * NOTE: 새 패키지 분리됨
 * - @obora/workflow-core: provider-agnostic 워크플로우 엔진
 * - @obora/agent-claude: Claude SDK adapter
 */

// 기존 API 유지 (하위 호환성)
export * from "./types";
export * from "./agent-loader";
export * from "./executor";
export * from "./tracker";
export * from "./db-init";
export * from "./project-service";

// 새 패키지 re-export
export { ClaudeAgentProvider, simpleQuery as claudeSimpleQuery } from "@obora/agent-claude";
export type { AgentProvider, AgentMessage } from "@obora/workflow-core";
