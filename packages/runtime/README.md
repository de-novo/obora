# @obora-kit/runtime

M1 Runtime Core package.

## Plugin System (M1-21)

런타임 확장 지점은 모두 플러그인으로 등록됩니다.

지원 타입 (8종):
- `agent`
- `tool`
- `pattern`
- `policy-rule`
- `recovery-strategy`
- `consensus-rule`
- `audit-store`
- `state-transform`

### 기본 사용

```ts
import {
  PluginRegistry,
  PluginLoader,
  registerBuiltinPlugins,
} from "@obora-kit/runtime";

const registry = new PluginRegistry();
await registerBuiltinPlugins(registry);

const loader = new PluginLoader(registry);
await loader.load(customPlugin, { replace: true });
await loader.unload(customPlugin.name);
```

### 검증 규칙

`validatePlugin`/`assertValidPlugin`은 다음을 검증합니다.
- 필수 공통 필드: `name`, `version`, `type`
- 타입별 인터페이스 메서드 존재 여부
  - 예: `tool` → `schema`, `execute`
  - 예: `audit-store` → `record`, `query`

### Built-in 정책

Built-in 또한 특권 하드코딩이 아닌 기본 플러그인으로 등록됩니다.
- `pipeline` pattern
- `file-write` tool
- `duckdb-audit-store` audit store
- 기타 policy/recovery/consensus/state-transform 기본 플러그인
