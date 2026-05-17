export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * multipliers[unit];
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object") {
    return value as Readonly<T>;
  }

  if (Object.isFrozen(value)) {
    return value as Readonly<T>;
  }

  const target = value as Record<string | symbol, unknown>;

  Reflect.ownKeys(target).forEach((key) => {
    const child = target[key];
    if (child !== null && typeof child === "object") {
      deepFreeze(child);
    }
  });

  return Object.freeze(value) as Readonly<T>;
}
