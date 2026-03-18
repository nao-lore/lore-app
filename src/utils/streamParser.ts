/**
 * SSE stream parser — parses Server-Sent Events from AI provider responses.
 */

/** Parse an SSE stream and extract text chunks */
export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  extractText: (event: Record<string, unknown>) => string | undefined,
  onChunk: (chunk: string, accumulated: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        const text = extractText(event);
        if (text) {
          accumulated += text;
          onChunk(text, accumulated);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  return accumulated;
}

/** Extract text from a Gemini SSE event */
export function extractGeminiText(event: Record<string, unknown>): string | undefined {
  const candidates = event.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  return candidates?.[0]?.content?.parts?.[0]?.text;
}

/** Extract text from an Anthropic SSE event */
export function extractAnthropicText(event: Record<string, unknown>): string | undefined {
  if (event.type === 'content_block_delta') {
    const delta = event.delta as { text?: string } | undefined;
    return delta?.text;
  }
  if (event.type === 'error') {
    const error = event.error as { message?: string } | undefined;
    throw new Error(`[Stream Error] ${error?.message || 'Unknown'}`);
  }
  return undefined;
}
