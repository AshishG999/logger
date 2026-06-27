import type {
  HookPoint,
  HookPayloadMap,
  HookResult,
  HookCancellation,
  IPlugin,
} from "@agstack/plugin-sdk";
import { EventBus } from "./event-bus";

export interface HookRegistration {
  pluginName: string;
  hookPoint: HookPoint;
  priority: number;
  handler: (payload: any) => Promise<HookCancellation | void>;
}

export class HookEngine {
  private hooks = new Map<HookPoint, HookRegistration[]>();

  register(
    pluginName: string,
    hookPoint: HookPoint,
    handler: (payload: any) => Promise<HookCancellation | void>,
    priority = 50
  ): void {
    const existing = this.hooks.get(hookPoint) || [];
    existing.push({ pluginName, hookPoint, priority, handler });
    existing.sort((a, b) => a.priority - b.priority);
    this.hooks.set(hookPoint, existing);
  }

  unregister(pluginName: string, hookPoint?: HookPoint): void {
    if (hookPoint) {
      const existing = this.hooks.get(hookPoint);
      if (existing) {
        this.hooks.set(
          hookPoint,
          existing.filter((h) => h.pluginName !== pluginName)
        );
      }
    } else {
      for (const [point, handlers] of this.hooks.entries()) {
        this.hooks.set(
          point,
          handlers.filter((h) => h.pluginName !== pluginName)
        );
      }
    }
  }

  async execute<T extends HookPoint>(
    hookPoint: T,
    payload: HookPayloadMap[T],
    eventBus?: EventBus
  ): Promise<HookResult<HookPayloadMap[T]>[]> {
    const handlers = this.hooks.get(hookPoint);
    if (!handlers || handlers.length === 0) return [];

    const results: HookResult<HookPayloadMap[T]>[] = [];

    for (const reg of handlers) {
      const startTime = Date.now();
      let output = payload;
      let cancellation: HookCancellation = { cancelled: false };
      let error: Error | undefined;

      try {
        if (eventBus) {
          (eventBus as any).publish("hook.before", {
            hookName: hookPoint,
            pluginName: reg.pluginName,
          });
        }

        const result = await reg.handler(payload);

        if (result && typeof result === "object" && "cancelled" in result) {
          cancellation = result as HookCancellation;
        }
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        if (eventBus) {
          (eventBus as any).publish("hook.error", {
            hookName: hookPoint,
            pluginName: reg.pluginName,
            error: error.message,
          });
        }
      } finally {
        if (eventBus && !error) {
          (eventBus as any).publish("hook.after", {
            hookName: hookPoint,
            pluginName: reg.pluginName,
            durationMs: Date.now() - startTime,
          });
        }
      }

      results.push({
        context: {
          hookPoint,
          pluginName: reg.pluginName,
          priority: reg.priority,
          startTime,
        },
        input: payload,
        output,
        cancellation,
        durationMs: Date.now() - startTime,
        error,
      });

      if (cancellation.cancelled) break;
    }

    return results;
  }

  clearPluginHooks(pluginName: string): void {
    for (const [point, handlers] of this.hooks.entries()) {
      const remaining = handlers.filter((h) => h.pluginName !== pluginName);
      if (remaining.length === 0) {
        this.hooks.delete(point);
      } else {
        this.hooks.set(point, remaining);
      }
    }
  }

  clear(): void {
    this.hooks.clear();
  }

  getRegisteredHooks(): Map<HookPoint, string[]> {
    const result = new Map<HookPoint, string[]>();
    for (const [point, handlers] of this.hooks.entries()) {
      result.set(
        point,
        handlers.map((h) => h.pluginName)
      );
    }
    return result;
  }
}
