export type KernelState =
  | "created"
  | "booting"
  | "running"
  | "stopping"
  | "stopped"
  | "error";

export type ShutdownHandler = () => Promise<void>;

export class LifecycleManager {
  private _state: KernelState = "created";
  private shutdownHandlers: ShutdownHandler[] = [];

  get state(): KernelState {
    return this._state;
  }

  setErrorState(): void {
    this._state = "error";
  }

  onBeforeShutdown(handler: ShutdownHandler): void {
    this.shutdownHandlers.push(handler);
  }

  async boot(bootFn: () => Promise<void>): Promise<void> {
    if (this._state !== "created") return;
    this._state = "booting";
    try {
      await bootFn();
      this._state = "running";
    } catch (error) {
      this._state = "error";
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this._state !== "running") return;
    this._state = "stopping";

    for (const handler of this.shutdownHandlers.reverse()) {
      try {
        await handler();
      } catch {
      }
    }

    this._state = "stopped";
  }

  assertRunning(): void {
    if (this._state !== "running") {
      throw new Error(
        `Kernel is in "${this._state}" state. Must be "running".`
      );
    }
  }
}
