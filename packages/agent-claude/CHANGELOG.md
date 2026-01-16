# Changelog

All notable changes to @obora/agent-claude will be documented in this file.

## [0.1.0] - 2026-01-16

### Added

- Initial release of @obora/agent-claude package
- `ClaudeAgentProvider` class implementing `AgentProvider` interface
- `simpleQuery` function for one-off queries without workflow orchestration
- Automatic token tracking (input, output, cache creation, cache read)
- Message streaming support with multiple message types (text, tool_use, tool_result, result, error)
- TypeScript type definitions with full type safety
- ESM module support with NodeNext module resolution
- Examples for basic usage and simple queries
- Comprehensive README documentation

### Dependencies

- @anthropic-ai/claude-agent-sdk ^0.2.9
- @obora/workflow-core workspace:*
