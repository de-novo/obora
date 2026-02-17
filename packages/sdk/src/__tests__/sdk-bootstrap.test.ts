import { describe, expect, it } from 'vitest';

import { OboraRuntime } from '../index.js';

describe('sdk bootstrap', () => {
  it('imports OboraRuntime', () => {
    expect(OboraRuntime).toBeTypeOf('function');
  });

  it('creates an OboraRuntime instance', () => {
    const runtime = new OboraRuntime();

    expect(runtime).toBeInstanceOf(OboraRuntime);
  });
});
