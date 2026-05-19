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

Object.defineProperties(Element.prototype, {
  hasPointerCapture: {
    value: () => false,
    writable: true,
  },
  releasePointerCapture: {
    value: () => undefined,
    writable: true,
  },
  setPointerCapture: {
    value: () => undefined,
    writable: true,
  },
});

Object.defineProperty(Element.prototype, "scrollIntoView", {
  value: () => undefined,
  writable: true,
});
