/**
 * JSON conversation import — extracts readable conversation text
 * from exported AI conversation files.
 *
 * Supported formats:
 * 1. ChatGPT export (conversations.json) — tree-based mapping
 * 2. Claude export — flat chat_messages array
 * 3. OpenAI API messages format — role/content array
 * 4. Anthropic API messages format — role/content blocks
 */

export interface JsonImportResult {
  /** Extracted conversation text, ready for the transform pipeline */
  content: string;
  /** Detected format name for display */
  format: string;
  /** Conversation title if available */
  title?: string;
  /** Timestamp (ms) if available */
  timestamp?: number;
}

// --- Format detection & extraction ---

export function parseConversationJson(raw: string, fileName: string): JsonImportResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${fileName}: invalid JSON`);
  }

  // Array of conversations (ChatGPT or Claude export)
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];

    // ChatGPT export: array of objects with "mapping"
    if (first && typeof first === 'object' && 'mapping' in first) {
      return parseChatGptExport(data, fileName);
    }

    // Claude export: array of objects with "chat_messages"
    if (first && typeof first === 'object' && 'chat_messages' in first) {
      return parseClaudeExport(data, fileName);
    }

    // Array of OpenAI-style messages: [{role, content}, ...]
    if (first && typeof first === 'object' && 'role' in first && 'content' in first) {
      return parseMessagesArray(data, 'OpenAI API', fileName);
    }
  }

  // Single conversation object
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // Single ChatGPT conversation with "mapping"
    if ('mapping' in obj) {
      return parseChatGptExport([obj], fileName);
    }

    // Single Claude conversation with "chat_messages"
    if ('chat_messages' in obj) {
      return parseClaudeExport([obj], fileName);
    }

    // Lore Capture extension format: {source, title, capturedAt, messages: [...]}
    if ('source' in obj && 'messages' in obj && Array.isArray(obj.messages)) {
      const title = typeof obj.title === 'string' ? obj.title : undefined;
      const capturedAt = typeof obj.capturedAt === 'string' ? new Date(obj.capturedAt).getTime() : undefined;
      const formatLabel = 'Lore Capture (' + (obj.source || 'unknown') + ')';
      const result = parseMessagesArray(obj.messages as unknown[], formatLabel, fileName);
      return {
        ...result,
        title: title || result.title,
        timestamp: capturedAt || result.timestamp,
      };
    }

    // OpenAI/Anthropic API format: {messages: [...]}
    if ('messages' in obj && Array.isArray(obj.messages)) {
      return parseMessagesArray(obj.messages as unknown[], 'API messages', fileName);
    }
  }

  throw new Error(`${fileName}: unsupported JSON format. Supported: ChatGPT export, Claude export, OpenAI/Anthropic API messages.`);
}

// --- ChatGPT export ---

interface ChatGptNode {
  id: string;
  parent: string | null;
  children: string[];
  message?: {
    author?: { role?: string };
    content?: { content_type?: string; parts?: unknown[] };
    create_time?: number;
  } | null;
}

function parseChatGptExport(conversations: unknown[], fileName: string): JsonImportResult {
  const parts: string[] = [];
  let firstTitle: string | undefined;
  let firstTimestamp: number | undefined;

  for (const conv of conversations) {
    const c = conv as Record<string, unknown>;
    const title = typeof c.title === 'string' ? c.title : undefined;
    if (!firstTitle && title) firstTitle = title;

    const mapping = c.mapping as Record<string, ChatGptNode> | undefined;
    if (!mapping) continue;

    // Walk the tree: find current_node, follow parent pointers to root, reverse
    const currentNode = typeof c.current_node === 'string' ? c.current_node : null;
    const orderedIds = currentNode
      ? walkParentChain(mapping, currentNode)
      : topologicalOrder(mapping);

    const lines: string[] = [];
    if (title) lines.push(`# ${title}\n`);

    for (const nodeId of orderedIds) {
      const node = mapping[nodeId];
      if (!node?.message) continue;
      const msg = node.message;
      const role = msg.author?.role;
      if (!role || role === 'system' || role === 'tool') continue;

      const text = extractChatGptMessageText(msg.content);
      if (!text) continue;

      if (!firstTimestamp && msg.create_time) {
        firstTimestamp = Math.floor(msg.create_time * 1000);
      }

      const label = role === 'user' ? 'User' : 'Assistant';
      lines.push(`**${label}:**\n${text}\n`);
    }

    if (lines.length > 0) parts.push(lines.join('\n'));
  }

  if (parts.length === 0) {
    throw new Error(`${fileName}: no readable messages found in ChatGPT export.`);
  }

  return {
    content: parts.join('\n---\n\n'),
    format: 'ChatGPT',
    title: firstTitle,
    timestamp: firstTimestamp,
  };
}

function walkParentChain(mapping: Record<string, ChatGptNode>, startId: string): string[] {
  const chain: string[] = [];
  let current: string | null = startId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = mapping[current]?.parent ?? null;
  }
  return chain.reverse();
}

function topologicalOrder(mapping: Record<string, ChatGptNode>): string[] {
  // Find root(s) — nodes with no parent
  const roots = Object.keys(mapping).filter((id) => !mapping[id].parent);
  const result: string[] = [];
  const visited = new Set<string>();

  function dfs(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    result.push(id);
    const node = mapping[id];
    if (node?.children) {
      for (const child of node.children) dfs(child);
    }
  }

  for (const root of roots) dfs(root);
  return result;
}

function extractChatGptMessageText(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const c = content as Record<string, unknown>;
  if (c.content_type !== 'text' || !Array.isArray(c.parts)) return '';
  return c.parts
    .filter((p): p is string => typeof p === 'string')
    .join('\n')
    .trim();
}

// --- Claude export ---

function parseClaudeExport(conversations: unknown[], fileName: string): JsonImportResult {
  const parts: string[] = [];
  let firstTitle: string | undefined;
  let firstTimestamp: number | undefined;

  for (const conv of conversations) {
    const c = conv as Record<string, unknown>;
    const title = typeof c.name === 'string' ? c.name : undefined;
    if (!firstTitle && title) firstTitle = title;

    const messages = c.chat_messages;
    if (!Array.isArray(messages)) continue;

    const lines: string[] = [];
    if (title) lines.push(`# ${title}\n`);

    for (const msg of messages) {
      const m = msg as Record<string, unknown>;
      const sender = m.sender as string | undefined;
      if (!sender) continue;

      const text = typeof m.text === 'string' ? m.text.trim() : '';
      if (!text) continue;

      if (!firstTimestamp && typeof m.created_at === 'string') {
        firstTimestamp = new Date(m.created_at).getTime();
      }

      const label = sender === 'human' ? 'User' : 'Assistant';
      lines.push(`**${label}:**\n${text}\n`);
    }

    if (lines.length > 0) parts.push(lines.join('\n'));
  }

  if (parts.length === 0) {
    throw new Error(`${fileName}: no readable messages found in Claude export.`);
  }

  return {
    content: parts.join('\n---\n\n'),
    format: 'Claude',
    title: firstTitle,
    timestamp: firstTimestamp,
  };
}

// --- OpenAI / Anthropic API messages format ---

function parseMessagesArray(messages: unknown[], formatName: string, fileName: string): JsonImportResult {
  const lines: string[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    const m = msg as Record<string, unknown>;
    const role = m.role as string | undefined;
    if (!role || role === 'system' || role === 'tool' || role === 'tool_result') continue;

    const text = extractApiMessageContent(m.content);
    if (!text) continue;

    const label = role === 'user' || role === 'human' ? 'User' : 'Assistant';
    lines.push(`**${label}:**\n${text}\n`);
  }

  if (lines.length === 0) {
    throw new Error(`${fileName}: no readable messages found in ${formatName} format.`);
  }

  return {
    content: lines.join('\n'),
    format: formatName,
    title: undefined,
    timestamp: undefined,
  };
}

function extractApiMessageContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object') {
          const b = block as Record<string, unknown>;
          if (b.type === 'text' && typeof b.text === 'string') return b.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}
