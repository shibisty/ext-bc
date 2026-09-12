/**
 * Serialises everything that does a read-modify-write of `items`.
 *
 * The `checking` flag in storage guards against a second *worker* starting a
 * pass, but within one worker an alarm-driven check and a CHECK_ONE from the
 * popup can still interleave: both read the whole `items` map, mutate their own
 * copy and write it back, so whichever finishes last silently discards the
 * other's result. Running them through one queue removes that window.
 */
let tail: Promise<unknown> = Promise.resolve();

export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  // Swallow rejections in the chain itself so one failure can't poison the
  // queue for every later caller; the original promise still rejects.
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
