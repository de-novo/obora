import type { ChatMessage, ToolCall } from "../llm/adapter";

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
  id: string;
  name: string;
  role: AgentRole;
  render(variables: Record<string, unknown>): string;
  toMessages(variables: Record<string, unknown>): ChatMessage[];
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
  parentName?: string;
  private template: string;
  private variables: Set<string>;
  private parent?: PromptTemplate;
  private systemPrompt?: string;
  private variableDefinitions: VariableDefinition[] = [];

  constructor(template: string, parent?: PromptTemplate);
  constructor(config: PromptTemplateConfig);
  constructor(templateOrConfig: string | PromptTemplateConfig, parent?: PromptTemplate) {
    if (typeof templateOrConfig === "string") {
      this.id = `template-${Date.now()}`;
      this.name = "Unnamed Template";
      this.role = "analyst";
      this.template = templateOrConfig;
      this.parent = parent;
    } else {
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

  setSystemPrompt(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
  }

  setVariableDefinitions(variables: VariableDefinition[]): void {
    this.variableDefinitions = variables;
  }

  render(variables: Record<string, unknown>): string {
    return this.renderInternal(variables, new Set<PromptTemplate>());
  }

  private renderInternal(variables: Record<string, unknown>, visited: Set<PromptTemplate>): string {
    if (visited.has(this)) {
      throw new Error(`Circular template inheritance detected: '${this.id}'`);
    }
    visited.add(this);

    let result = this.template;

    if (this.parent) {
      const parentResult = this.parent.renderInternal(variables, visited);
      result = `${parentResult}\n\n${result}`;
    }

    result = this.processConditionals(result, variables);
    result = this.substituteVariables(result, variables);
    result = this.handleUnsubstituted(result, variables);

    return result.trim();
  }

  private extractVariables(template: string): void {
    const patterns = [/\{\{([\w.]+)\}\}/g, /\{\{([\w.]+)\|[^}]+\}\}/g];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(template)) !== null) {
        this.variables.add(match[1]);
      }
    }
  }

  private substituteVariables(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{([\w.]+)\}\}/g, (match, name) => {
      const value = this.getNestedValue(variables, name);
      if (value === undefined) {
        return match;
      }
      return String(value);
    });
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (typeof current === "object" && current !== null) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private processConditionals(template: string, variables: Record<string, unknown>): string {
    let changed = true;
    let maxIterations = 20;
    let iterations = 0;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      template = template.replace(
        /\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
        (match, name, content) => {
          changed = true;
          const value = this.getNestedValue(variables, name);
          if (!Array.isArray(value) || value.length === 0) {
            return "";
          }
          return value
            .map((item: unknown, index: number) => {
              let itemContent = content.replace(/\{\{@index\}\}/g, String(index));
              itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
              if (typeof item === "object" && item !== null && !Array.isArray(item)) {
                itemContent = this.substituteVariables(
                  itemContent,
                  item as Record<string, unknown>
                );
                itemContent = this.handleUnsubstituted(
                  itemContent,
                  item as Record<string, unknown>
                );
                itemContent = this.processConditionals(
                  itemContent,
                  item as Record<string, unknown>
                );
              }
              return itemContent;
            })
            .join("");
        }
      );

      template = template.replace(
        /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (match, name, content) => {
          changed = true;
          const value = this.getNestedValue(variables, name);
          const parts = content.split(/\{\{else\}\}/);
          const ifContent = parts[0];
          const elseContent = parts[1] || "";
          return this.isTruthy(value) ? ifContent : elseContent;
        }
      );

      template = template.replace(
        /\{\{#unless\s+([\w.]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
        (match, name, content) => {
          changed = true;
          const value = this.getNestedValue(variables, name);
          return !this.isTruthy(value) ? content : "";
        }
      );
    }

    return template;
  }

  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  private handleUnsubstituted(template: string, variables: Record<string, unknown>): string {
    template = template.replace(/\{\{([\w.]+)\|([^}]+)\}\}/g, (match, name, defaultValue) => {
      const value = this.getNestedValue(variables, name);
      return value !== undefined ? String(value) : defaultValue;
    });

    return template.replace(/\{\{[\w.]+\}\}/g, "");
  }

  getVariables(): string[] {
    return Array.from(this.variables);
  }

  extend(parent: PromptTemplate): void {
    this.parent = parent;
  }

  merge(other: PromptTemplate): PromptTemplate {
    const mergedTemplate = `${this.template}\n\n${other.template}`;
    const merged = new PromptTemplate(mergedTemplate, this.parent);
    merged.variables = new Set([...this.variables, ...other.variables]);
    return merged;
  }

  clone(): PromptTemplate {
    const cloned = new PromptTemplate(this.template, this.parent);
    cloned.id = this.id;
    cloned.name = this.name;
    cloned.role = this.role;
    cloned.systemPrompt = this.systemPrompt;
    cloned.variables = new Set(this.variables);
    cloned.variableDefinitions = [...this.variableDefinitions];
    return cloned;
  }

  toMessages(variables: Record<string, unknown>): ChatMessage[] {
    const messages: ChatMessage[] = [];

    if (this.systemPrompt) {
      messages.push({ role: "system", content: this.systemPrompt });
    }

    messages.push({
      role: "user",
      content: this.render(variables),
    });

    return messages;
  }

  validate(variables: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    for (const varDef of this.variableDefinitions) {
      if (varDef.required && variables[varDef.name] === undefined) {
        errors.push(`Required variable '${varDef.name}' is missing`);
      }

      const value = variables[varDef.name];
      if (value !== undefined) {
        const actualType = Array.isArray(value) ? "array" : typeof value;
        if (actualType !== varDef.type) {
          errors.push(
            `Variable '${varDef.name}' should be type '${varDef.type}', but got '${actualType}'`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

export interface VariableDefinition {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface PromptTemplateConfig {
  id: string;
  name: string;
  role: AgentRole;
  system: string;
  user: string;
  variables: VariableDefinition[];
  examples?: Example[];
  outputFormat?: OutputFormat;
}

export interface Example {
  input: Record<string, unknown>;
  output: string;
}

export interface OutputFormat {
  type: "text" | "json" | "markdown" | "code";
  schema?: JSONSchema;
}

export interface JSONSchema {
  type: "object" | "array" | "string" | "number" | "boolean";
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
}

export type AgentRole = "analyst" | "executor" | "verifier" | "director";
