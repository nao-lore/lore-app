/**
 * Chunk splitting logic — splits large text inputs into manageable chunks
 * for the AI processing pipeline.
 */

import { getActiveProvider } from './provider';

// Chunk targets per provider — Claude has strict input token limits
const CHUNK_TARGETS = {
  anthropic: { worklog: 12_000, handoff: 10_000 },
  gemini:    { worklog: 60_000, handoff: 50_000 },
  openai:    { worklog: 30_000, handoff: 25_000 },
} as const;

/** Get chunk target sizes for the active provider */
export function getChunkTargets() {
  const provider = getActiveProvider();
  return CHUNK_TARGETS[provider] ?? CHUNK_TARGETS.gemini;
}

/** Hard cap: no single chunk may exceed this in extract phase */
const EXTRACT_MAX_CHARS = 60_000;

/** Split text into chunks of approximately chunkTarget characters */
export function splitIntoChunks(text: string, chunkTarget: number): string[] {
  const fileSeparator = /(?=--- FILE: .+ ---\n)/g;
  const segments = text.split(fileSeparator).filter((s) => s.trim());

  if (segments.length > 1) {
    return groupSegments(segments, chunkTarget);
  }

  const paragraphs = text.split(/\n{2,}/);
  return groupSegments(paragraphs.map((p) => p + '\n\n'), chunkTarget);
}

/** Group small segments up to target size, splitting oversized segments */
export function groupSegments(segments: string[], target: number): string[] {
  // First pass: split any oversized segment at line boundaries
  const split: string[] = [];
  for (const seg of segments) {
    if (seg.length <= EXTRACT_MAX_CHARS) {
      split.push(seg);
    } else {
      const lines = seg.split('\n');
      let buf = '';
      for (const line of lines) {
        if (buf.length + line.length + 1 > EXTRACT_MAX_CHARS && buf.length > 0) {
          split.push(buf);
          buf = line + '\n';
        } else {
          buf += line + '\n';
        }
      }
      if (buf.trim()) split.push(buf);
    }
  }

  // Second pass: group small segments up to target size
  const chunks: string[] = [];
  let current = '';

  for (const seg of split) {
    if (seg.length > target * 1.5 && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    if (current.length + seg.length > target && current.length > 0) {
      chunks.push(current.trim());
      current = seg;
    } else {
      current += seg;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
