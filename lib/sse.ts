export interface SSEMessage {
  step: string;
  progress?: number;
  message?: string;
  error?: string;
  processing_id?: string;
  [key: string]: unknown;
}

/**
 * Creates a standard Server-Sent Events (SSE) stream.
 */
export function createSSEStream(
  handler: (send: (data: SSEMessage) => Promise<void>) => Promise<void>
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = async (data: SSEMessage) => {
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (e) {
          console.error('[SSE] Failed to enqueue message:', e);
        }
      };

      try {
        await handler(send);
      } catch (error) {
        console.error('[SSE] Stream handler error:', error);
        await send({
          step: 'error',
          error: error instanceof Error ? error.message : 'Internal Stream Error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
    },
  });
}
