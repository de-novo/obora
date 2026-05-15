class NoopResizeObserver implements ResizeObserver {
  disconnect(): void {
    return undefined;
  }

  observe(): void {
    return undefined;
  }

  unobserve(): void {
    return undefined;
  }
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: NoopResizeObserver,
  writable: true,
});
