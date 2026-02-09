import type { ActorId } from '../types/actor';
import type { ActorRuntime } from '../runtime/ActorRuntime';
import { Supervisor } from './Supervisor';
import type { SupervisorConfig } from './types';

/**
 * Supervisor 트리 노드
 */
interface SupervisorNode {
  id: string;
  supervisor: Supervisor;
  parent: string | null;
  children: Set<string>;
}

/**
 * Supervisor Tree
 *
 * 계층적인 Supervisor 구조를 관리합니다.
 * 상위 Supervisor가 하위 Supervisor와 Actor들을 감독합니다.
 */
export class SupervisorTree {
  private readonly nodes: Map<string, SupervisorNode>;
  private readonly runtime: ActorRuntime;
  private rootId: string | null;

  constructor(runtime: ActorRuntime) {
    this.runtime = runtime;
    this.nodes = new Map();
    this.rootId = null;
  }

  /**
   * 루트 Supervisor 생성
   * @param config Supervisor 설정
   * @returns 루트 Supervisor ID
   */
  createRoot(config?: Partial<SupervisorConfig>): string {
    if (this.rootId) {
      throw new Error('Root supervisor already exists');
    }

    const id = this.generateId('root');
    const supervisor = new Supervisor(this.runtime, config);

    this.nodes.set(id, {
      id,
      supervisor,
      parent: null,
      children: new Set(),
    });

    this.rootId = id;
    supervisor.start();

    // 에스컬레이션 처리 (루트는 에스컬레이션 불가)
    supervisor.on('escalate', (actorId: ActorId, error: Error) => {
      console.error(
        `[SupervisorTree] Escalation at root for ${actorId}:`,
        error
      );
    });

    return id;
  }

  /**
   * 자식 Supervisor 생성
   * @param parentId 부모 Supervisor ID
   * @param config Supervisor 설정
   * @returns 자식 Supervisor ID
   */
  createChild(parentId: string, config?: Partial<SupervisorConfig>): string {
    const parent = this.nodes.get(parentId);
    if (!parent) {
      throw new Error(`Parent supervisor not found: ${parentId}`);
    }

    const id = this.generateId('child');
    const supervisor = new Supervisor(this.runtime, config);

    this.nodes.set(id, {
      id,
      supervisor,
      parent: parentId,
      children: new Set(),
    });

    parent.children.add(id);
    supervisor.start();

    // 에스컬레이션 처리
    supervisor.on('escalate', (actorId: ActorId, error: Error) => {
      this.handleEscalation(id, actorId, error);
    });

    return id;
  }

  /**
   * Supervisor 조회
   * @param id Supervisor ID
   * @returns Supervisor 인스턴스
   */
  getSupervisor(id: string): Supervisor {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Supervisor not found: ${id}`);
    }
    return node.supervisor;
  }

  /**
   * 루트 Supervisor 조회
   */
  getRoot(): Supervisor | null {
    if (!this.rootId) {
      return null;
    }
    return this.nodes.get(this.rootId)?.supervisor || null;
  }

  /**
   * Supervisor 제거
   * @param id Supervisor ID
   */
  remove(id: string): void {
    const node = this.nodes.get(id);
    if (!node) {
      return;
    }

    // 자식들 먼저 제거
    for (const childId of node.children) {
      this.remove(childId);
    }

    // Supervisor 정지
    node.supervisor.stop();

    // 부모에서 제거
    if (node.parent) {
      const parent = this.nodes.get(node.parent);
      parent?.children.delete(id);
    }

    // 맵에서 제거
    this.nodes.delete(id);

    // 루트인 경우
    if (id === this.rootId) {
      this.rootId = null;
    }
  }

  /**
   * 전체 트리 정지
   */
  shutdown(): void {
    if (this.rootId) {
      this.remove(this.rootId);
    }
  }

  /**
   * 트리 구조 출력 (디버그용)
   */
  printTree(): string {
    if (!this.rootId) {
      return '(empty tree)';
    }

    const lines: string[] = [];
    this.printNode(this.rootId, 0, lines);
    return lines.join('\n');
  }

  // ==================== 내부 메서드 ====================

  private handleEscalation(
    supervisorId: string,
    actorId: ActorId,
    error: Error
  ): void {
    const node = this.nodes.get(supervisorId);
    if (!node || !node.parent) {
      // 루트 도달 - 처리 불가
      console.error(
        `[SupervisorTree] Unhandled escalation for ${actorId}:`,
        error
      );
      return;
    }

    // 부모 Supervisor에게 전달
    const parent = this.nodes.get(node.parent);
    if (parent) {
      parent.supervisor.handleFailure(actorId, error);
    }
  }

  private printNode(id: string, depth: number, lines: string[]): void {
    const node = this.nodes.get(id);
    if (!node) return;

    const indent = '  '.repeat(depth);
    const watched = node.supervisor.getWatchedActors();
    lines.push(`${indent}[${id}] watching: ${watched.join(', ') || '(none)'}`);

    for (const childId of node.children) {
      this.printNode(childId, depth + 1, lines);
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
