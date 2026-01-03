# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-01-03

### Added

- Initial release of `@obora/core`
- **DebateEngine**: Multi-AI debate orchestration with strong/weak modes
- **Providers**: Support for Claude, OpenAI, and Gemini
  - OAuth authentication support (use existing subscriptions)
  - API key authentication support
  - Native WebSearch integration per provider
- **Streaming**: Real-time streaming output for debates
- **Skills**: Extensible skill system for debate customization
- **CLI**: Command-line interface for running debates (`@obora/cli`)

### Features

- Strong debate mode with rebuttal and revision phases
- Weak debate mode for quick consensus
- Parallel and single modes for comparison
- WebSearch tool integration for fact-checking during rebuttals
- YAML configuration support for debate scenarios

[Unreleased]: https://github.com/de-novo/obora/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/de-novo/obora/releases/tag/v0.1.0
