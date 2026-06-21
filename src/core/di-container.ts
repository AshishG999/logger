export type Factory<T> = () => T;

export interface RegisterOptions {
  singleton?: boolean;
  lazy?: boolean;
  tags?: string[];
}

interface Registration<T> {
  factory: Factory<T>;
  instance?: T;
  options: RegisterOptions;
}

export class DIContainer {
  private registry = new Map<string, Registration<any>>();

  register<T>(name: string, factory: Factory<T>, options?: RegisterOptions): void {
    this.registry.set(name, {
      factory,
      options: { singleton: true, lazy: true, ...options },
    });
  }

  resolve<T>(name: string): T {
    const reg = this.registry.get(name);
    if (!reg) throw new Error(`No registration for "${name}"`);

    if (reg.options.singleton) {
      if (!reg.instance) reg.instance = reg.factory();
      return reg.instance as T;
    }

    return reg.factory() as T;
  }

  resolveAll<T>(tag: string): T[] {
    const results: T[] = [];
    for (const [name, reg] of this.registry) {
      if (reg.options.tags?.includes(tag)) {
        results.push(this.resolve<T>(name));
      }
    }
    return results;
  }

  has(name: string): boolean {
    return this.registry.has(name);
  }

  clear(): void {
    this.registry.clear();
  }
}
