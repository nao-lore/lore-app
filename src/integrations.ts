/**
 * External integrations — Notion & Slack.
 * Settings are stored in localStorage with encryption.
 */
import type { LogEntry } from './types';
import { logToMarkdown } from './markdown';
import { safeGetItem, safeSetItem } from './storage';
import { encrypt, decrypt } from './utils/crypto';

// ─── Storage keys ───
const NOTION_KEY = 'threadlog_notion_api_key';
const NOTION_DB_KEY = 'threadlog_notion_database_id';
const SLACK_WEBHOOK_KEY = 'threadlog_slack_webhook_url';

// ─── Notion settings ───

export async function getNotionApiKey(): Promise<string> {
  const raw = safeGetItem(NOTION_KEY) || '';
  if (!raw) return '';
  return decrypt(raw);
}

export async function setNotionApiKey(key: string): Promise<void> {
  if (!key) {
    safeSetItem(NOTION_KEY, '');
    return;
  }
  const encrypted = await encrypt(key);
  safeSetItem(NOTION_KEY, encrypted);
}

export async function getNotionDatabaseId(): Promise<string> {
  const raw = safeGetItem(NOTION_DB_KEY) || '';
  if (!raw) return '';
  return decrypt(raw);
}

export async function setNotionDatabaseId(id: string): Promise<void> {
  if (!id) {
    safeSetItem(NOTION_DB_KEY, '');
    return;
  }
  const encrypted = await encrypt(id);
  safeSetItem(NOTION_DB_KEY, encrypted);
}

export async function isNotionConfigured(): Promise<boolean> {
  const [apiKey, dbId] = await Promise.all([getNotionApiKey(), getNotionDatabaseId()]);
  return !!apiKey && !!dbId;
}

// ─── Slack settings ───

export async function getSlackWebhookUrl(): Promise<string> {
  const raw = safeGetItem(SLACK_WEBHOOK_KEY) || '';
  if (!raw) return '';
  return decrypt(raw);
}

export async function setSlackWebhookUrl(url: string): Promise<void> {
  if (!url) {
    safeSetItem(SLACK_WEBHOOK_KEY, '');
    return;
  }
  const encrypted = await encrypt(url);
  safeSetItem(SLACK_WEBHOOK_KEY, encrypted);
}

export async function isSlackConfigured(): Promise<boolean> {
  return !!(await getSlackWebhookUrl());
}

// ─── Notion API ───

function buildNotionBlocks(markdown: string): object[] {
  const lines = markdown.split('\n');
  const blocks: object[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3) } }] },
      });
    } else if (line.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: [{ type: 'text', text: { content: line.slice(4) } }] },
      });
    } else if (line.startsWith('- [x] ')) {
      blocks.push({
        object: 'block',
        type: 'to_do',
        to_do: { rich_text: [{ type: 'text', text: { content: line.slice(6) } }], checked: true },
      });
    } else if (line.startsWith('- [ ] ')) {
      blocks.push({
        object: 'block',
        type: 'to_do',
        to_do: { rich_text: [{ type: 'text', text: { content: line.slice(6) } }], checked: false },
      });
    } else if (line.startsWith('- ')) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
      });
    } else {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: line } }] },
      });
    }
  }

  // Notion API limits to 100 blocks per request
  return blocks.slice(0, 100);
}

export async function sendToNotion(log: LogEntry): Promise<void> {
  const apiKey = await getNotionApiKey();
  const databaseId = await getNotionDatabaseId();
  if (!apiKey || !databaseId) {
    throw new Error('Notion API key or Database ID not configured.');
  }

  const markdown = logToMarkdown(log);
  const blocks = buildNotionBlocks(markdown);
  const date = new Date(log.createdAt).toISOString().slice(0, 10);
  const typeLabel = log.outputMode === 'handoff' ? 'Handoff' : 'Worklog';

  const body = {
    parent: { database_id: databaseId },
    properties: {
      Name: {
        title: [{ text: { content: log.title } }],
      },
      Type: {
        select: { name: typeLabel },
      },
      Date: {
        date: { start: date },
      },
      Tags: {
        multi_select: log.tags.slice(0, 10).map((tag) => ({ name: tag })),
      },
    },
    children: blocks,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (import.meta.env.DEV) {
        let detail = `Notion API error: ${res.status}`;
        try {
          const err = JSON.parse(text);
          if (err.message) detail = `Notion: ${err.message}`;
        } catch (parseErr) { console.warn('[integrations] Notion error parse:', parseErr); }
        console.error('[integrations]', detail);
      }
      throw new Error('NOTION_EXPORT_FAILED');
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Slack API ───

/**
 * Convert markdown to Slack mrkdwn format.
 * Slack uses *bold*, _italic_, and ~strikethrough~ instead of standard markdown.
 */
function markdownToSlackMrkdwn(md: string): string {
  return md
    // Headers: Slack doesn't support headers, use bold
    .replace(/^### (.+)$/gm, '*$1*')
    .replace(/^## (.+)$/gm, '*$1*')
    .replace(/^# (.+)$/gm, '*$1*')
    // Bold: **text** → *text*
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    // Checkboxes
    .replace(/^- \[x\] /gm, '☑ ')
    .replace(/^- \[ \] /gm, '☐ ');
}

export async function sendToSlack(markdown: string): Promise<void> {
  const webhookUrl = await getSlackWebhookUrl();
  if (!webhookUrl) {
    throw new Error('Slack Webhook URL not configured.');
  }

  const text = markdownToSlackMrkdwn(markdown);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (import.meta.env.DEV) {
        const body = await res.text().catch(() => '');
        console.error('[integrations] Slack error:', res.status, body);
      }
      throw new Error('SLACK_EXPORT_FAILED');
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
