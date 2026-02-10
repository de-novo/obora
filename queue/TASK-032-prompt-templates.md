# TASK-032: 프롬프트 템플릿 시스템

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 6시간
- 담당: 개발자
- Phase: Week 5-6

## 목표
에이전트용 프롬프트 템플릿 시스템 구현

## 작업 내용

### 1. PromptTemplate 클래스

**파일 위치:** `packages/agents/src/prompts/template.ts`

```typescript
/**
 * 유효성 검사 결과
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * 프롬프트 템플릿 인터페이스 (스펙 14-ai-agents.md와 일치)
 */
export interface IPromptTemplate {
  // 템플릿 ID
  id: string;

  // 템플릿 이름
  name: string;

  // 역할
  role: AgentRole;

  // 템플릿 렌더링
  render(variables: Record<string, unknown>): string;

  // 메시지 생성 (스펙에 추가됨)
  toMessages(variables: Record<string, unknown>): ChatMessage[];

  // 변수 검증 (스펙에 추가됨)
  validate(variables: Record<string, unknown>): ValidationResult;
}

/**
 * 프롬프트 템플릿
 * 변수 치환, 조건부 섹션, 템플릿 상속 지원
 */
export class PromptTemplate implements IPromptTemplate {
  id: string;
  name: string;
  role: AgentRole;

  private template: string;
  private variables: Set<string>;
  private parent?: PromptTemplate;
  private systemPrompt?: string;
  private variableDefinitions: VariableDefinition[] = [];

  constructor(template: string, parent?: PromptTemplate);
  constructor(config: PromptTemplateConfig);
  constructor(templateOrConfig: string | PromptTemplateConfig, parent?: PromptTemplate) {
    if (typeof templateOrConfig === 'string') {
      // 기존 호환성: 문자열로 생성
      this.id = `template-${Date.now()}`;
      this.name = 'Unnamed Template';
      this.role = 'analyst';
      this.template = templateOrConfig;
      this.parent = parent;
    } else {
      // 스펙 기반: 설정 객체로 생성
      const config = templateOrConfig;
      this.id = config.id;
      this.name = config.name;
      this.role = config.role;
      this.template = config.user;
      this.systemPrompt = config.system;
      this.variableDefinitions = config.variables;
    }
    this.variables = new Set();
    this.extractVariables(this.template);
  }

  /**
   * 시스템 프롬프트 설정
   */
  setSystemPrompt(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
  }

  /**
   * 변수 정의 설정
   */
  setVariableDefinitions(variables: VariableDefinition[]): void {
    this.variableDefinitions = variables;
  }

  /**
   * 템플릿 렌더링
   */
  render(variables: Record<string, unknown>): string {
    let result = this.template;

    // 부모 템플릿 먼저 렌더링
    if (this.parent) {
      const parentResult = this.parent.render(variables);
      result = `${parentResult}\n\n${result}`;
    }

    // 조건부 섹션 처리
    result = this.processConditionals(result, variables);

    // 변수 치환
    result = this.substituteVariables(result, variables);

    // 미치환 변수 처리
    result = this.handleUnsubstituted(result, variables);

    return result.trim();
  }

  /**
   * 변수 추출
   */
  private extractVariables(template: string): void {
    const pattern = /\{\{(\w+)\}\}/g;
    let match;
    while ((match = pattern.exec(template)) !== null) {
      this.variables.add(match[1]);
    }
  }

  /**
   * 변수 치환
   */
  private substituteVariables(
    template: string,
    variables: Record<string, unknown>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      const value = this.getNestedValue(variables, name);
      if (value === undefined) {
        return match; // 나중에 처리
      }
      return String(value);
    });
  }

  /**
   * 중첩 값 가져오기
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (typeof current === 'object' && current !== null) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * 조건부 섹션 처리
   * 형식: {{#if variable}}...{{/if}}
   * 형식: {{#unless variable}}...{{/unless}}
   */
  private processConditionals(
    template: string,
    variables: Record<string, unknown>
  ): string {
    // {{#if}} 처리
    template = template.replace(
      /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (match, name, content) => {
        const value = this.getNestedValue(variables, name);
        return this.isTruthy(value) ? content : '';
      }
    );

    // {{#unless}} 처리
    template = template.replace(
      /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
      (match, name, content) => {
        const value = this.getNestedValue(variables, name);
        return !this.isTruthy(value) ? content : '';
      }
    );

    return template;
  }

  /**
   * Truthy 판별
   */
  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  /**
   * 미치환 변수 처리
   */
  private handleUnsubstituted(
    template: string,
    variables: Record<string, unknown>
  ): string {
    // 기본값 처리: {{variable|default}}
    template = template.replace(
      /\{\{(\w+)\|([^}]+)\}\}/g,
      (match, name, defaultValue) => {
        const value = this.getNestedValue(variables, name);
        return value !== undefined ? String(value) : defaultValue;
      }
    );

    // 여전히 미치환된 변수는 빈 문자열로 대체
    return template.replace(/\{\{\w+\}\}/g, '');
  }

  /**
   * 변수 목록 반환
   */
  getVariables(): string[] {
    return Array.from(this.variables);
  }

  /**
   * 부모 템플릿 설정
   */
  extend(parent: PromptTemplate): void {
    this.parent = parent;
  }

  /**
   * 템플릿 병합
   */
  merge(other: PromptTemplate): PromptTemplate {
    const mergedTemplate = `${this.template}\n\n${other.template}`;
    const merged = new PromptTemplate(mergedTemplate, this.parent);
    merged.variables = new Set([...this.variables, ...other.variables]);
    return merged;
  }

  /**
   * 템플릿 복제
   */
  clone(): PromptTemplate {
    const cloned = new PromptTemplate(this.template, this.parent);
    cloned.id = this.id;
    cloned.name = this.name;
    cloned.role = this.role;
    cloned.systemPrompt = this.systemPrompt;
    cloned.variables = new Set(this.variables);
    return cloned;
  }

  /**
   * 메시지 생성 (스펙 IPromptTemplate 인터페이스)
   * ChatMessage[] 형식으로 변환하여 LLM에 전달
   */
  toMessages(variables: Record<string, unknown>): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 시스템 프롬프트 추가 (있는 경우)
    if (this.systemPrompt) {
      messages.push({ role: 'system', content: this.systemPrompt });
    }

    // 렌더링된 사용자 프롬프트 추가
    messages.push({
      role: 'user',
      content: this.render(variables),
    });

    return messages;
  }

  /**
   * 변수 검증 (스펙 IPromptTemplate 인터페이스)
   * 정의된 변수 정의와 비교하여 유효성 검사
   */
  validate(variables: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    // 템플릿에서 추출한 변수들 중 필수 변수 확인
    for (const varDef of this.variableDefinitions) {
      if (varDef.required && variables[varDef.name] === undefined) {
        errors.push(`Required variable '${varDef.name}' is missing`);
      }

      const value = variables[varDef.name];
      if (value !== undefined && typeof value !== varDef.type) {
        errors.push(`Variable '${varDef.name}' should be type '${varDef.type}', but got '${typeof value}'`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

/**
 * 변수 정의
 */
export interface VariableDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default?: unknown;
  description?: string;
}

/**
 * PromptTemplate 설정 (스펙 PromptTemplateConfig와 일치)
 */
export interface PromptTemplateConfig {
  id: string;
  name: string;
  role: AgentRole;

  // 시스템 프롬프트
  system: string;

  // 사용자 프롬프트 템플릿
  user: string;

  // 변수 정의
  variables: VariableDefinition[];

  // 예시 (Few-shot)
  examples?: Example[];

  // 출력 형식
  outputFormat?: OutputFormat;
}

/**
 * 예시
 */
export interface Example {
  input: Record<string, unknown>;
  output: string;
}

/**
 * 출력 형식
 */
export interface OutputFormat {
  type: 'text' | 'json' | 'markdown' | 'code';
  schema?: JSONSchema;  // JSON 출력 시
}

/**
 * JSON Schema
 */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
}

/**
 * ChatMessage 타입 (스펙에서 참조)
 */
export type AgentRole = 'analyst' | 'executor' | 'verifier' | 'director';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  functionCall?: {
    name: string;
    arguments: string;
  };
}
```

### 2. 템플릿 레지스트리

**파일 위치:** `packages/agents/src/prompts/registry.ts`

```typescript
import { PromptTemplate } from './template';

/**
 * 템플릿 레지스트리
 */
export class PromptTemplateRegistry {
  private templates: Map<string, PromptTemplate>;
  private aliases: Map<string, string>;

  constructor() {
    this.templates = new Map();
    this.aliases = new Map();
  }

  /**
   * 템플릿 등록
   */
  register(name: string, template: string): void {
    this.templates.set(name, new PromptTemplate(template));
  }

  /**
   * 템플릿 가져오기
   */
  get(name: string): PromptTemplate | undefined {
    const resolvedName = this.aliases.get(name) ?? name;
    return this.templates.get(resolvedName);
  }

  /**
   * 템플릿 렌더링
   */
  render(name: string, variables: Record<string, unknown>): string {
    const template = this.get(name);
    if (!template) {
      throw new Error(`Template not found: ${name}`);
    }
    return template.render(variables);
  }

  /**
   * 별칭 등록
   */
  alias(name: string, alias: string): void {
    this.aliases.set(alias, name);
  }

  /**
   * 템플릿 상속 설정
   */
  extend(name: string, parent: string): void {
    const child = this.get(name);
    const parentTemplate = this.get(parent);

    if (!child || !parentTemplate) {
      throw new Error(`Template not found: ${!child ? name : parent}`);
    }

    child.extend(parentTemplate);
  }

  /**
   * 모든 템플릿 이름 반환
   */
  list(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * 파일에서 템플릿 로드
   */
  async loadFromFile(path: string, name?: string): Promise<void> {
    // Node.js 환경에서만 사용 가능
    if (typeof process === 'undefined') {
      throw new Error('loadFromFile is only available in Node.js environment');
    }

    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    const templateName = name ?? this.extractNameFromPath(path);
    this.register(templateName, content);
  }

  /**
   * 디렉토리에서 템플릿 로드
   */
  async loadFromDirectory(dir: string): Promise<void> {
    if (typeof process === 'undefined') {
      throw new Error('loadFromDirectory is only available in Node.js environment');
    }

    const fs = await import('fs/promises');
    const path = await import('path');
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const fullPath = path.join(dir, entry.name);
        await this.loadFromFile(fullPath);
      }
    }
  }

  /**
   * 경로에서 이름 추출
   */
  private extractNameFromPath(path: string): string {
    const filename = path.split('/').pop() ?? path;
    return filename.replace(/\.(md|txt)$/, '');
  }

  /**
   * 레지스트리 초기화
   */
  clear(): void {
    this.templates.clear();
    this.aliases.clear();
  }
}

/**
 * 전역 레지스트리 인스턴스
 */
export const globalPromptRegistry = new PromptTemplateRegistry();
```

### 3. 역할별 기본 템플릿

**파일 위치:** `packages/agents/src/prompts/templates/analyst.md`

```markdown
You are an expert analyst with deep expertise in data analysis, risk assessment, and pattern recognition.

Your responsibilities:
{{#if responsibilities}}
{{responsibilities}}
{{else}}
1. Analyze the provided information thoroughly
2. Identify key findings and patterns
3. Provide actionable recommendations
4. Assess confidence in your conclusions
5. Support your findings with reasoning
{{/if}}

When providing analysis, structure your response as follows:

## Summary
{{#if context}}Context: {{context}}{{/if}}
Provide a concise overview of your analysis.

## Key Findings
- Finding 1: [description]
- Finding 2: [description]
- ...

## Recommendations
- Recommendation 1: [actionable suggestion]
- Recommendation 2: [actionable suggestion]
- ...

## Confidence
{{confidence|85}}/100

## Reasoning
Provide your thought process and evidence supporting your conclusions.

{{#if sources}}
## Sources
{{sources}}
{{/if}}

Be thorough, objective, and analytical in your approach.
```

**파일 위치:** `packages/agents/src/prompts/templates/executor.md`

```markdown
You are an executor agent responsible for taking action and executing tasks.

Your responsibilities:
{{#if responsibilities}}
{{responsibilities}}
{{else}}
1. Understand the task requirements clearly
2. Determine the best approach to complete the task
3. Execute the action using available tools
4. Report the outcome accurately
5. Handle errors gracefully
{{/if}}

Available tools: {{tools|none}}

When planning execution, structure your response as follows:

## Action
{{action|The action you will take}}

## Tool
{{#if tool}}Tool: {{tool}}{{else}}No tool required{{/if}}

## Parameters
```json
{{#if parameters}}{{parameters}}{{else}}{{{/if}}}
```

## Steps
1. [First step]
2. [Second step]
...

## Expected Outcome
{{expectedOutcome|The expected result}}

Be precise, efficient, and safety-conscious in your execution.

{{#if safety_notes}}
## Safety Notes
{{safety_notes}}
{{/if}}
```

**파일 위치:** `packages/agents/src/prompts/templates/verifier.md`

```markdown
You are a verifier agent responsible for validating results and ensuring quality.

Your responsibilities:
{{#if responsibilities}}
{{responsibilities}}
{{else}}
1. Review the provided work thoroughly
2. Check against requirements and specifications
3. Identify any issues or discrepancies
4. Provide specific feedback for improvements
5. Verify correctness and completeness
{{/if}}

When conducting verification, structure your response as follows:

## Overall Result
{{#if passed}}✅ PASSED{{else}}❌ FAILED{{/if}}

## Verification Checks
| Check | Description | Status | Evidence |
|-------|-------------|--------|----------|
| 1 | [check description] | [passed/failed/skipped] | [evidence] |
| 2 | [check description] | [passed/failed/skipped] | [evidence] |

## Summary
{{summary|Brief overview of the verification}}

## Issues Found
{{#unless issues}}No issues found.{{/unless}}
{{#if issues}}
{{#each issues}}
### {{severity|medium}}: {{description}}
{{#if location}}Location: {{location}}{{/if}}
{{#if recommendation}}Recommendation: {{recommendation}}{{/if}}
---
{{/each}}
{{/if}}

## Suggestions
{{#unless suggestions}}No suggestions.{{/unless}}
{{#if suggestions}}
{{#each suggestions}}
- {{this}}
{{/each}}
{{/if}}

Issue severity levels:
- **Critical**: Must be fixed before proceeding
- **High**: Should be fixed soon
- **Medium**: Can be addressed later
- **Low**: Minor improvements or suggestions

Be thorough, objective, and constructive in your verification.
```

**파일 위치:** `packages/agents/src/prompts/templates/director.md`

```markdown
You are a director agent responsible for coordinating activities and facilitating collaboration.

Your responsibilities:
{{#if responsibilities}}
{{responsibilities}}
{{else}}
1. Understand the overall goal and requirements
2. Coordinate between different agents and stakeholders
3. Facilitate discussions and consensus-building
4. Monitor progress and adjust plans as needed
5. Provide clear direction and guidance
{{/if}}

When creating a coordination plan, structure your response as follows:

## Agenda
{{agenda|The main goal or purpose}}

## Participants
{{#each participants}}
- {{this}}
{{/each}}

## Steps
{{#each steps}}
### Step {{@index}}: {{description}}
{{#if assignee}}Assignee: {{assignee}}{{/if}}
{{#if dependencies}}Dependencies: {{dependencies}}{{/if}}
{{#if estimatedDuration}}Duration: {{estimatedDuration}}{{/if}}
{{/each}}

## Timeline
{{#each timeline}}
- {{this}}
{{/each}}

## Expected Outcome
{{expectedOutcome|What should be achieved}}

## Key Principles for Coordination
- Clear communication
- Inclusive participation
- Transparent decision-making
- Agile adaptation to changes
- Focus on results

Be diplomatic, organized, and results-oriented in your coordination.

{{#if notes}}
## Notes
{{notes}}
{{/if}}
```

### 4. 템플릿 빌더

**파일 위치:** `packages/agents/src/prompts/builder.ts`

```typescript
import { PromptTemplate } from './template';

/**
 * 프롬프트 템플릿 빌더
 */
export class PromptTemplateBuilder {
  private parts: string[];
  private sections: Map<string, string>;
  private extends?: string;

  constructor() {
    this.parts = [];
    this.sections = new Map();
  }

  /**
   * 기본 텍스트 추가
   */
  addText(text: string): this {
    this.parts.push(text);
    return this;
  }

  /**
   * 섹션 추가
   */
  addSection(name: string, content: string): this {
    this.sections.set(name, content);
    this.parts.push(`{{section:${name}}}`);
    return this;
  }

  /**
   * 조건부 섹션 추가
   */
  addConditional(variable: string, content: string): this {
    this.parts.push(`{{#if ${variable}}}${content}{{/if}}`);
    return this;
  }

  /**
   * 변수 추가
   */
  addVariable(name: string, defaultValue?: string): this {
    const placeholder = defaultValue ? `{{${name}|${defaultValue}}}` : `{{${name}}}`;
    this.parts.push(placeholder);
    return this;
  }

  /**
   * 헤더 추가
   */
  addHeader(level: number, text: string): this {
    const prefix = '#'.repeat(level);
    this.parts.push(`\n${prefix} ${text}\n`);
    return this;
  }

  /**
   * 리스트 추가
   */
  addList(items: string[], ordered: boolean = false): this {
    const prefix = ordered ? '1. ' : '- ';
    this.parts.push('\n' + items.map(item => `${prefix}${item}`).join('\n') + '\n');
    return this;
  }

  /**
   * 코드 블록 추가
   */
  addCodeBlock(code: string, language: string = ''): this {
    this.parts.push(`\n\`\`\`${language}\n${code}\n\`\`\`\n`);
    return this;
  }

  /**
   * 테이블 추가
   */
  addTable(headers: string[], rows: string[][]): this {
    const separator = headers.map(() => '---').join(' | ');

    this.parts.push(`\n| ${headers.join(' | ')} |`);
    this.parts.push(`| ${separator} |`);

    for (const row of rows) {
      this.parts.push(`| ${row.join(' | ')} |`);
    }

    this.parts.push('\n');
    return this;
  }

  /**
   * 구분선 추가
   */
  addDivider(): this {
    this.parts.push('\n---\n');
    return this;
  }

  /**
   * 빈 줄 추가
   */
  addNewline(count: number = 1): this {
    this.parts.push('\n'.repeat(count));
    return this;
  }

  /**
   * 상속 설정
   */
  extends(template: string): this {
    this.extends = template;
    return this;
  }

  /**
   * 템플릿 빌드
   */
  build(): PromptTemplate {
    const template = this.parts.join('');

    const promptTemplate = new PromptTemplate(template);
    if (this.extends) {
      // 부모 템플릿 설정은 레지스트리를 통해서만 가능
      promptTemplate['parentName'] = this.extends;
    }

    return promptTemplate;
  }

  /**
   * 템플릿 문자열 반환
   */
  toString(): string {
    return this.parts.join('');
  }

  /**
   * 빌더 초기화
   */
  reset(): this {
    this.parts = [];
    this.sections.clear();
    this.extends = undefined;
    return this;
  }

  /**
   * 빌더 복제
   */
  clone(): PromptTemplateBuilder {
    const builder = new PromptTemplateBuilder();
    builder.parts = [...this.parts];
    builder.sections = new Map(this.sections);
    builder.extends = this.extends;
    return builder;
  }
}
```

### 5. 역할별 템플릿 팩토리

**파일 위치:** `packages/agents/src/prompts/role-templates.ts`

```typescript
import { PromptTemplateBuilder } from './builder';

/**
 * Analyst 템플릿 빌더
 */
export function buildAnalystTemplate(
  config?: {
    responsibilities?: string;
    context?: string;
    sources?: string;
  }
): PromptTemplateBuilder {
  return new PromptTemplateBuilder()
    .addText('You are an expert analyst with deep expertise in data analysis, risk assessment, and pattern recognition.')
    .addNewline()
    .addHeader(2, 'Your responsibilities')
    .addConditional('responsibilities', '{{responsibilities}}')
    .addConditional('responsibilities', '', 'else')
    .addList([
      'Analyze the provided information thoroughly',
      'Identify key findings and patterns',
      'Provide actionable recommendations',
      'Assess confidence in your conclusions',
      'Support your findings with reasoning',
    ])
    .addText('{{/if}}')
    .addNewline()
    .addHeader(2, 'When providing analysis, structure your response as follows:')
    .addNewline()
    .addHeader(3, 'Summary')
    .addConditional('context', 'Context: {{context}}')
    .addText('Provide a concise overview of your analysis.')
    .addNewline()
    .addHeader(3, 'Key Findings')
    .addText('- Finding 1: [description]')
    .addText('- Finding 2: [description]')
    .addText('- ...')
    .addNewline()
    .addHeader(3, 'Recommendations')
    .addText('- Recommendation 1: [actionable suggestion]')
    .addText('- Recommendation 2: [actionable suggestion]')
    .addText('- ...')
    .addNewline()
    .addHeader(3, 'Confidence')
    .addVariable('confidence', '85')
    .addText('/100')
    .addNewline()
    .addHeader(3, 'Reasoning')
    .addText('Provide your thought process and evidence supporting your conclusions.')
    .addConditional('sources', '')
    .addNewline()
    .addHeader(3, 'Sources')
    .addVariable('sources')
    .addText('{{/if}}')
    .addNewline()
    .addText('Be thorough, objective, and analytical in your approach.');
}

/**
 * Executor 템플릿 빌더
 */
export function buildExecutorTemplate(
  config?: {
    responsibilities?: string;
    tools?: string;
    safetyNotes?: string;
  }
): PromptTemplateBuilder {
  return new PromptTemplateBuilder()
    .addText('You are an executor agent responsible for taking action and executing tasks.')
    .addNewline()
    .addHeader(2, 'Your responsibilities')
    .addConditional('responsibilities', '{{responsibilities}}')
    .addConditional('responsibilities', '', 'else')
    .addList([
      'Understand the task requirements clearly',
      'Determine the best approach to complete the task',
      'Execute the action using available tools',
      'Report the outcome accurately',
      'Handle errors gracefully',
    ])
    .addText('{{/if}}')
    .addNewline()
    .addText(`Available tools: {{tools|${config?.tools ?? 'none'}}}`)
    .addNewline()
    .addHeader(2, 'When planning execution, structure your response as follows:')
    .addNewline()
    .addHeader(3, 'Action')
    .addVariable('action', 'The action you will take')
    .addNewline()
    .addHeader(3, 'Tool')
    .addConditional('tool', 'Tool: {{tool}}', 'else')
    .addText('No tool required')
    .addText('{{/if}}')
    .addNewline()
    .addHeader(3, 'Parameters')
    .addCodeBlock('{{#if parameters}}{{parameters}}{{else}}{{{/if}}}', 'json')
    .addNewline()
    .addHeader(3, 'Steps')
    .addText('1. [First step]')
    .addText('2. [Second step]')
    .addText('...')
    .addNewline()
    .addHeader(3, 'Expected Outcome')
    .addVariable('expectedOutcome', 'The expected result')
    .addNewline()
    .addText('Be precise, efficient, and safety-conscious in your execution.')
    .addConditional('safety_notes', '')
    .addNewline()
    .addHeader(3, 'Safety Notes')
    .addVariable('safetyNotes')
    .addText('{{/if}}');
}

/**
 * Verifier 템플릿 빌더
 */
export function buildVerifierTemplate(
  config?: {
    responsibilities?: string;
  }
): PromptTemplateBuilder {
  return new PromptTemplateBuilder()
    .addText('You are a verifier agent responsible for validating results and ensuring quality.')
    .addNewline()
    .addHeader(2, 'Your responsibilities')
    .addConditional('responsibilities', '{{responsibilities}}')
    .addConditional('responsibilities', '', 'else')
    .addList([
      'Review the provided work thoroughly',
      'Check against requirements and specifications',
      'Identify any issues or discrepancies',
      'Provide specific feedback for improvements',
      'Verify correctness and completeness',
    ])
    .addText('{{/if}}')
    .addNewline()
    .addHeader(2, 'When conducting verification, structure your response as follows:')
    .addNewline()
    .addHeader(3, 'Overall Result')
    .addConditional('passed', '✅ PASSED', 'else')
    .addText('❌ FAILED')
    .addText('{{/if}}')
    .addNewline()
    .addHeader(3, 'Verification Checks')
    .addTable(
      ['Check', 'Description', 'Status', 'Evidence'],
      [
        ['1', '[check description]', '[passed/failed/skipped]', '[evidence]'],
        ['2', '[check description]', '[passed/failed/skipped]', '[evidence]'],
      ]
    )
    .addNewline()
    .addHeader(3, 'Summary')
    .addVariable('summary', 'Brief overview of the verification')
    .addNewline()
    .addHeader(3, 'Issues Found')
    .addConditional('issues', 'No issues found.', 'unless')
    .addText('{{#if issues}}')
    .addText('{{#each issues}}')
    .addHeader(4, '{{severity|medium}}: {{description}}')
    .addConditional('location', 'Location: {{location}}')
    .addConditional('recommendation', 'Recommendation: {{recommendation}}')
    .addText('---')
    .addText('{{/each}}')
    .addText('{{/if}}')
    .addNewline()
    .addHeader(3, 'Suggestions')
    .addConditional('suggestions', 'No suggestions.', 'unless')
    .addText('{{#if suggestions}}')
    .addText('{{#each suggestions}}')
    .addText('- {{this}}')
    .addText('{{/each}}')
    .addText('{{/if}}')
    .addNewline()
    .addText('Issue severity levels:')
    .addList([
      '**Critical**: Must be fixed before proceeding',
      '**High**: Should be fixed soon',
      '**Medium**: Can be addressed later',
      '**Low**: Minor improvements or suggestions',
    ])
    .addNewline()
    .addText('Be thorough, objective, and constructive in your verification.');
}

/**
 * Director 템플릿 빌더
 */
export function buildDirectorTemplate(
  config?: {
    responsibilities?: string;
  }
): PromptTemplateBuilder {
  return new PromptTemplateBuilder()
    .addText('You are a director agent responsible for coordinating activities and facilitating collaboration.')
    .addNewline()
    .addHeader(2, 'Your responsibilities')
    .addConditional('responsibilities', '{{responsibilities}}')
    .addConditional('responsibilities', '', 'else')
    .addList([
      'Understand the overall goal and requirements',
      'Coordinate between different agents and stakeholders',
      'Facilitate discussions and consensus-building',
      'Monitor progress and adjust plans as needed',
      'Provide clear direction and guidance',
    ])
    .addText('{{/if}}')
    .addNewline()
    .addHeader(2, 'When creating a coordination plan, structure your response as follows:')
    .addNewline()
    .addHeader(3, 'Agenda')
    .addVariable('agenda', 'The main goal or purpose')
    .addNewline()
    .addHeader(3, 'Participants')
    .addText('{{#each participants}}')
    .addText('- {{this}}')
    .addText('{{/each}}')
    .addNewline()
    .addHeader(3, 'Steps')
    .addText('{{#each steps}}')
    .addHeader(4, 'Step {{@index}}: {{description}}')
    .addConditional('assignee', 'Assignee: {{assignee}}')
    .addConditional('dependencies', 'Dependencies: {{dependencies}}')
    .addConditional('estimatedDuration', 'Duration: {{estimatedDuration}}')
    .addText('{{/each}}')
    .addNewline()
    .addHeader(3, 'Timeline')
    .addText('{{#each timeline}}')
    .addText('- {{this}}')
    .addText('{{/each}}')
    .addNewline()
    .addHeader(3, 'Expected Outcome')
    .addVariable('expectedOutcome', 'What should be achieved')
    .addNewline()
    .addHeader(2, 'Key Principles for Coordination')
    .addList([
      'Clear communication',
      'Inclusive participation',
      'Transparent decision-making',
      'Agile adaptation to changes',
      'Focus on results',
    ])
    .addNewline()
    .addText('Be diplomatic, organized, and results-oriented in your coordination.')
    .addConditional('notes', '')
    .addNewline()
    .addHeader(3, 'Notes')
    .addVariable('notes')
    .addText('{{/if}}');
}
```

### 6. 내보내기 설정

**파일 위치:** `packages/agents/src/prompts/index.ts`

```typescript
export * from './template';
export * from './registry';
export * from './builder';
export * from './role-templates';

export { globalPromptRegistry as registry } from './registry';
```

## 완료 조건
- [ ] PromptTemplate 클래스 구현 완료
- [ ] PromptTemplateRegistry 구현 완료
- [ ] PromptTemplateBuilder 구현 완료
- [ ] 역할별 기본 템플릿 작성 완료
- [ ] 역할별 템플릿 팩토리 구현 완료
- [ ] 단위 테스트 작성

## 의존성
- TASK-031 (Agent Roles)

## 사용 예시

### 기본 템플릿 사용
```typescript
import { PromptTemplate } from '@obora-kit/agents';

const template = new PromptTemplate(`
Hello {{name}},

You are assigned to: {{task}}

{{#if deadline}}
Deadline: {{deadline}}
{{/if}}
{{#unless deadline}}
No deadline set
{{/unless}}

Best regards,
{{sender|Your AI Assistant}}
`);

const result = template.render({
  name: 'Alice',
  task: 'Analyze the data',
  deadline: '2026-02-10',
  sender: 'Director',
});

console.log(result);
```

### 레지스트리 사용
```typescript
import { PromptTemplateRegistry } from '@obora-kit/agents';

const registry = new PromptTemplateRegistry();

registry.register('analyst', `
You are an expert analyst.
Context: {{context}}
{{#if data}}Data: {{data}}{{/if}}
`);

const rendered = registry.render('analyst', {
  context: 'Market analysis',
  data: 'Revenue data Q4',
});
```

### 빌더 사용
```typescript
import { PromptTemplateBuilder } from '@obora-kit/agents';

const builder = new PromptTemplateBuilder()
  .addHeader(1, 'Analysis Report')
  .addNewline()
  .addText('Context: {{context}}')
  .addNewline()
  .addHeader(2, 'Findings')
  .addList([
    'Finding 1: {{finding1}}',
    'Finding 2: {{finding2}}',
  ])
  .addNewline()
  .addConditional('recommendation', 'Recommendation: {{recommendation}}');

const template = builder.build();
const rendered = template.render({
  context: 'Market analysis',
  finding1: 'Revenue increased by 20%',
  finding2: 'Customer satisfaction dropped',
  recommendation: 'Focus on improving customer service',
});
```

### 역할별 템플릿 빌더
```typescript
import { buildAnalystTemplate, buildExecutorTemplate } from '@obora-kit/agents';

const analystTemplate = buildAnalystTemplate({
  context: 'Financial analysis',
}).build();

const executorTemplate = buildExecutorTemplate({
  tools: 'file-writer, api-caller',
  safetyNotes: 'Ensure all API calls are rate-limited',
}).build();
```

### 파일에서 템플릿 로드
```typescript
import { PromptTemplateRegistry } from '@obora-kit/agents';

const registry = new PromptTemplateRegistry();

// 단일 파일 로드
await registry.loadFromFile('./prompts/analyst.md', 'analyst');

// 디렉토리에서 모든 템플릿 로드
await registry.loadFromDirectory('./prompts/');

// 템플릿 렌더링
const result = registry.render('analyst', {
  context: 'Data analysis',
});
```

## 엣지 케이스
1. 중첩 변수 경로 처리 (`user.profile.name`)
2. 순환 참조 상속 탐지 및 방지
3. 빈 템플릿 렌더링 처리
4. 대규모 템플릿 메모리 최적화
5. UTF-8 외 문자 처리
6. 기본값 변수 재정의 확인
7. 조건부 블록 내부에서의 변수 치환 순서

## 참고 자료
- Handlebars 템플릿 문법 참고
- TASK-031: 역할별 에이전트 구현

---

*작성일: 2026-02-04*
*버전: 1.0.0*
