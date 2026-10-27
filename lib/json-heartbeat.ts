// JSON permits leading whitespace. Periodic newlines keep a long inference
// response active through reverse proxies while the client waits for its JSON.
export function jsonHeartbeat(work: () => Promise<unknown>, errorMessage: (error: unknown) => string, intervalMs = 15000) {
  const encoder = new TextEncoder();
  let canceled = false;
  let timer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("\n"));
      timer = setInterval(() => { if (!canceled) controller.enqueue(encoder.encode("\n")); }, intervalMs);
      void (async () => {
        try {
          const data = await work();
          if (!canceled) controller.enqueue(encoder.encode(JSON.stringify(data)));
        } catch (error) {
          if (!canceled) controller.enqueue(encoder.encode(JSON.stringify({error: errorMessage(error)})));
        } finally {
          clearInterval(timer);
          if (!canceled) controller.close();
        }
      })();
    },
    cancel() { canceled = true; clearInterval(timer); },
  });
  return new Response(stream, {headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no",
  }});
}
