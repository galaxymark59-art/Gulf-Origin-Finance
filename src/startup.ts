// Surface stalled bridge/storage/session initialization without clearing any data.
export async function withStartupTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs = 15000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("STARTUP_TIMEOUT")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
