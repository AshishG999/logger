export function now(): number {
  return Date.now();
}

export function hrtime(): bigint {
  return process.hrtime.bigint();
}

export function hrtimeToMs(bigint: bigint): number {
  return Number(bigint) / 1_000_000;
}

export function elapsedMs(start: bigint): number {
  return hrtimeToMs(process.hrtime.bigint() - start);
}
