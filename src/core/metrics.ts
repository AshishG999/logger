export interface MetricPoint {
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export class MetricsCollector {
  private counters = new Map<string, MetricPoint[]>();
  private gauges = new Map<string, MetricPoint>();
  private histograms = new Map<string, number[]>();
  private readonly maxDataPoints = 10000;

  recordCounter(name: string, value: number, tags?: Record<string, string>): void {
    const existing = this.counters.get(name) || [];
    existing.push({ value, timestamp: Date.now(), tags });
    if (existing.length > this.maxDataPoints) {
      existing.shift();
    }
    this.counters.set(name, existing);
  }

  incrementCounter(name: string, tags?: Record<string, string>): void {
    this.recordCounter(name, 1, tags);
  }

  recordGauge(name: string, value: number, tags?: Record<string, string>): void {
    this.gauges.set(name, { value, timestamp: Date.now(), tags });
  }

  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    const existing = this.histograms.get(name) || [];
    existing.push(value);
    if (existing.length > this.maxDataPoints) {
      existing.splice(0, existing.length - this.maxDataPoints);
    }
    this.histograms.set(name, existing);
  }

  getCounter(name: string): number {
    const points = this.counters.get(name);
    if (!points || points.length === 0) return 0;
    return points.reduce((sum, p) => sum + p.value, 0);
  }

  getGauge(name: string): number | undefined {
    return this.gauges.get(name)?.value;
  }

  getHistogramStats(name: string): { count: number; sum: number; avg: number; min: number; max: number; p50: number; p95: number; p99: number } | undefined {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) return undefined;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    return {
      count: sorted.length,
      sum,
      avg: sum / sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  getSnapshot(): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {};
    for (const [name] of this.counters) {
      snapshot[`counter.${name}`] = this.getCounter(name);
    }
    for (const [name] of this.gauges) {
      snapshot[`gauge.${name}`] = this.getGauge(name);
    }
    for (const [name] of this.histograms) {
      snapshot[`histogram.${name}`] = this.getHistogramStats(name);
    }
    return snapshot;
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}
