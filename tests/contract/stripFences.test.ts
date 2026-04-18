import { describe, expect, it } from 'vitest';
import { stripMarkdownFences } from '@main/services/stripFences.js';

describe('stripMarkdownFences', () => {
  it('leaves unfenced text alone', () => {
    expect(stripMarkdownFences('Hello world.')).toBe('Hello world.');
  });

  it('strips a plain ``` fence', () => {
    expect(stripMarkdownFences('```\nHello world.\n```')).toBe('Hello world.');
  });

  it('strips a language-tagged fence', () => {
    expect(stripMarkdownFences('```markdown\nHello world.\n```')).toBe('Hello world.');
    expect(stripMarkdownFences('```md\nHello world.\n```')).toBe('Hello world.');
    expect(stripMarkdownFences('```text\nHello world.\n```')).toBe('Hello world.');
  });

  it('tolerates surrounding whitespace', () => {
    expect(stripMarkdownFences('   ```\nHello world.\n```   \n')).toBe('Hello world.');
  });

  it('preserves multi-line body and interior blank lines', () => {
    const input = '```markdown\nFirst paragraph.\n\nSecond paragraph.\n```';
    expect(stripMarkdownFences(input)).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('leaves a partial fence intact (only leading or trailing) — we only unwrap balanced pairs', () => {
    expect(stripMarkdownFences('```markdown\nOnly opened.')).toBe('```markdown\nOnly opened.');
    expect(stripMarkdownFences('Only closed.\n```')).toBe('Only closed.\n```');
  });

  it('handles Windows line endings', () => {
    expect(stripMarkdownFences('```\r\nHello world.\r\n```')).toBe('Hello world.');
  });
});
