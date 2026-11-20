/** Serialize terminal prompts so a keypress can resolve exactly one approval. */
export class ApprovalBroker {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(
    operation: () => Promise<T>,
    onAcquire: () => void = () => undefined,
    onRelease: () => void = () => undefined,
  ): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      onAcquire();
      return await operation();
    } finally {
      try { onRelease(); } finally { release(); }
    }
  }
}