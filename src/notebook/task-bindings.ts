export interface TaskBindingContext {
  taskId: string;
  sessionId?: string;
  tabId?: number;
}

interface BoundContext {
  sessionId?: string;
  tabId?: number;
}

export class TaskBindingRegistry {
  private readonly bindingsByTaskId = new Map<string, BoundContext>();
  private readonly taskIdBySessionId = new Map<string, string>();
  private readonly taskIdByTabId = new Map<number, string>();

  bind(taskId: string, context: { sessionId?: string; tabId?: number }): void {
    const previous = this.bindingsByTaskId.get(taskId);
    const next: BoundContext = {
      sessionId: context.sessionId ?? previous?.sessionId,
      tabId: context.tabId ?? previous?.tabId,
    };

    if (previous?.sessionId && previous.sessionId !== next.sessionId && this.taskIdBySessionId.get(previous.sessionId) === taskId) {
      this.taskIdBySessionId.delete(previous.sessionId);
    }
    if (previous?.tabId !== undefined && previous.tabId !== next.tabId && this.taskIdByTabId.get(previous.tabId) === taskId) {
      this.taskIdByTabId.delete(previous.tabId);
    }

    if (next.sessionId) {
      const priorTaskId = this.taskIdBySessionId.get(next.sessionId);
      if (priorTaskId && priorTaskId !== taskId) {
        const prior = this.bindingsByTaskId.get(priorTaskId);
        if (prior?.sessionId === next.sessionId) {
          prior.sessionId = undefined;
          if (prior.tabId === undefined) this.bindingsByTaskId.delete(priorTaskId);
        }
      }
      this.taskIdBySessionId.set(next.sessionId, taskId);
    }

    if (next.tabId !== undefined) {
      const priorTaskId = this.taskIdByTabId.get(next.tabId);
      if (priorTaskId && priorTaskId !== taskId) {
        const prior = this.bindingsByTaskId.get(priorTaskId);
        if (prior?.tabId === next.tabId) {
          prior.tabId = undefined;
          if (!prior.sessionId) this.bindingsByTaskId.delete(priorTaskId);
        }
      }
      this.taskIdByTabId.set(next.tabId, taskId);
    }

    if (next.sessionId || next.tabId !== undefined) {
      this.bindingsByTaskId.set(taskId, next);
    }
  }

  resolve(params: { taskId?: string; sessionId?: string; tabId?: number }): string | null {
    if (params.taskId) return params.taskId;
    if (params.sessionId && params.sessionId !== "default") {
      return this.taskIdBySessionId.get(params.sessionId) ?? null;
    }
    if (params.tabId !== undefined) {
      return this.taskIdByTabId.get(params.tabId) ?? null;
    }
    return null;
  }

  seed(bindings: TaskBindingContext[]): void {
    this.bindingsByTaskId.clear();
    this.taskIdBySessionId.clear();
    this.taskIdByTabId.clear();

    const sessionCounts = new Map<string, number>();
    const tabCounts = new Map<number, number>();

    for (const binding of bindings) {
      if (binding.sessionId && binding.sessionId !== "default") {
        sessionCounts.set(binding.sessionId, (sessionCounts.get(binding.sessionId) ?? 0) + 1);
      }
      if (binding.tabId !== undefined) {
        tabCounts.set(binding.tabId, (tabCounts.get(binding.tabId) ?? 0) + 1);
      }
    }

    for (const binding of bindings) {
      this.bind(binding.taskId, {
        sessionId: binding.sessionId && sessionCounts.get(binding.sessionId) === 1 ? binding.sessionId : undefined,
        tabId: binding.tabId !== undefined && tabCounts.get(binding.tabId) === 1 ? binding.tabId : undefined,
      });
    }
  }
}
