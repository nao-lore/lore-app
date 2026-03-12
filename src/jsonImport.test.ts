import { describe, it, expect } from 'vitest';
import { parseConversationJson } from './jsonImport';

describe('parseConversationJson', () => {
  it('throws on invalid JSON', () => {
    expect(() => parseConversationJson('not json', 'test.json')).toThrow('invalid JSON');
  });

  it('throws on unsupported format', () => {
    expect(() => parseConversationJson('{"foo": "bar"}', 'test.json')).toThrow('unsupported JSON format');
  });

  it('parses OpenAI API messages format', () => {
    const data = JSON.stringify([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]);

    const result = parseConversationJson(data, 'test.json');
    expect(result.format).toBe('OpenAI API');
    expect(result.content).toContain('**User:**');
    expect(result.content).toContain('Hello');
    expect(result.content).toContain('**Assistant:**');
    expect(result.content).toContain('Hi there!');
  });

  it('parses API messages with object content blocks', () => {
    const data = JSON.stringify([
      { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }] },
      { role: 'assistant', content: [{ type: 'text', text: '4' }] },
    ]);

    const result = parseConversationJson(data, 'test.json');
    expect(result.content).toContain('What is 2+2?');
    expect(result.content).toContain('4');
  });

  it('parses wrapped messages format', () => {
    const data = JSON.stringify({
      messages: [
        { role: 'user', content: 'Help me' },
        { role: 'assistant', content: 'Sure!' },
      ],
    });

    const result = parseConversationJson(data, 'test.json');
    expect(result.format).toBe('API messages');
    expect(result.content).toContain('Help me');
  });

  it('parses Claude export format', () => {
    const data = JSON.stringify([
      {
        name: 'My Chat',
        chat_messages: [
          { sender: 'human', text: 'Hi Claude', created_at: '2026-01-01T00:00:00Z' },
          { sender: 'assistant', text: 'Hello!' },
        ],
      },
    ]);

    const result = parseConversationJson(data, 'test.json');
    expect(result.format).toBe('Claude');
    expect(result.title).toBe('My Chat');
    expect(result.content).toContain('Hi Claude');
    expect(result.content).toContain('Hello!');
    expect(result.timestamp).toBeTruthy();
  });

  it('parses ChatGPT export format', () => {
    const data = JSON.stringify([
      {
        title: 'GPT Chat',
        current_node: 'node-2',
        mapping: {
          'node-0': {
            id: 'node-0',
            parent: null,
            children: ['node-1'],
            message: null,
          },
          'node-1': {
            id: 'node-1',
            parent: 'node-0',
            children: ['node-2'],
            message: {
              author: { role: 'user' },
              content: { content_type: 'text', parts: ['Hello GPT'] },
              create_time: 1700000000,
            },
          },
          'node-2': {
            id: 'node-2',
            parent: 'node-1',
            children: [],
            message: {
              author: { role: 'assistant' },
              content: { content_type: 'text', parts: ['Hi!'] },
            },
          },
        },
      },
    ]);

    const result = parseConversationJson(data, 'test.json');
    expect(result.format).toBe('ChatGPT');
    expect(result.title).toBe('GPT Chat');
    expect(result.content).toContain('Hello GPT');
    expect(result.content).toContain('Hi!');
  });

  it('skips system and tool messages', () => {
    const data = JSON.stringify([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hi' },
      { role: 'tool', content: 'tool result' },
      { role: 'assistant', content: 'Hello' },
    ]);

    const result = parseConversationJson(data, 'test.json');
    expect(result.content).not.toContain('You are helpful');
    expect(result.content).not.toContain('tool result');
    expect(result.content).toContain('Hi');
    expect(result.content).toContain('Hello');
  });

  it('parses Lore Capture format', () => {
    const data = JSON.stringify({
      source: 'chatgpt',
      title: 'Captured Chat',
      capturedAt: '2026-03-01T12:00:00Z',
      messages: [
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
      ],
    });

    const result = parseConversationJson(data, 'test.json');
    expect(result.format).toContain('Lore Capture');
    expect(result.title).toBe('Captured Chat');
    expect(result.content).toContain('Question');
    expect(result.content).toContain('Answer');
  });
});
