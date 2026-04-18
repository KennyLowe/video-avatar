import { describe, expect, it } from 'vitest';
import { lint } from '@renderer/services/spokenLinter.js';

describe('spokenLinter', () => {
  it('flags lines that open with a bullet marker', () => {
    const marks = lint('First point.\n- second point is a bullet\n* another bullet');
    const bullets = marks.filter((m) => m.ruleId === 'bullet-list-syntax');
    expect(bullets.map((m) => m.line)).toEqual([2, 3]);
  });

  it('flags numbered list markers', () => {
    const marks = lint('1. first\n2. second\nnot a list though');
    const bullets = marks.filter((m) => m.ruleId === 'bullet-list-syntax');
    expect(bullets.map((m) => m.line)).toEqual([1, 2]);
  });

  it('flags bare URLs anywhere in a line', () => {
    const marks = lint('check https://example.com/docs for details');
    const urls = marks.filter((m) => m.ruleId === 'bare-url');
    expect(urls).toHaveLength(1);
    expect(urls[0]?.column).toBe(7); // 1-indexed
    expect(urls[0]?.length).toBe('https://example.com/docs'.length);
  });

  it('flags long parenthetical asides', () => {
    const marks = lint('Hello (in case you missed it) world.');
    const parens = marks.filter((m) => m.ruleId === 'parenthetical-aside');
    expect(parens).toHaveLength(1);
  });

  it('does not flag short parentheticals', () => {
    const marks = lint('Hello (briefly) world.');
    expect(marks.filter((m) => m.ruleId === 'parenthetical-aside')).toHaveLength(0);
  });

  it('flags acronyms without a first-use expansion', () => {
    const marks = lint('Use HTTP here. Then call the HTTP endpoint again.');
    const acronyms = marks.filter((m) => m.ruleId === 'acronym-without-expansion');
    // Only the first occurrence is flagged.
    expect(acronyms).toHaveLength(1);
    expect(acronyms[0]?.line).toBe(1);
  });

  it('does not flag acronyms with an inline expansion', () => {
    const marks = lint('Use HTTP (hypertext transfer protocol) here.');
    expect(marks.filter((m) => m.ruleId === 'acronym-without-expansion')).toHaveLength(0);
  });

  it('does not flag common stop acronyms like OK / TV', () => {
    const marks = lint('TV is OK. The USA is fine too.');
    expect(marks.filter((m) => m.ruleId === 'acronym-without-expansion')).toHaveLength(0);
  });

  it('returns an empty list on plain prose', () => {
    expect(lint('A perfectly ordinary sentence.')).toEqual([]);
  });

  it('computes line numbers across multiple lines for acronyms', () => {
    const marks = lint('Opening sentence.\nSecond line mentions API here.');
    const acronyms = marks.filter((m) => m.ruleId === 'acronym-without-expansion');
    expect(acronyms[0]?.line).toBe(2);
  });
});
