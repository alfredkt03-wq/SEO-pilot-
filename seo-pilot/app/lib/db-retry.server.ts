const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retries transient database errors (e.g. a sleeping Neon database dropping the
// first connection). Worst case adds ~1.6s, under Shopify's 5s webhook limit.
// A thrown Response (such as the 401 for a bad webhook signature) is a real
// answer, not a glitch, so it is never retried.
export async function withRetry<T>(fn: () => Promise<T>, label = "db"): Promise<T> {
  let lastError: unknown;
  for (const delay of [0, 400, 1200]) {
    if (delay) await sleep(delay);
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Response) throw error;
      lastError = error;
      console.error(`[${label}] attempt failed:`, error);
    }
  }
  throw lastError;
}
