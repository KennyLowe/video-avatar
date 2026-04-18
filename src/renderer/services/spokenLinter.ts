// Spoken-word linter per FR-011. Rule-based; runs on every edit in the
// Script studio. Output is stable position info that Monaco can map into
// decorations. Pure function, no React / Monaco / DOM imports — so it runs
// under vitest in the node env (see tests/contract/spokenLinter.test.ts).

export interface LintMark {
  readonly ruleId:
    | 'parenthetical-aside'
    | 'bullet-list-syntax'
    | 'bare-url'
    | 'acronym-without-expansion';
  readonly message: string;
  /** 1-indexed line number. */
  readonly line: number;
  /** 1-indexed column where the mark begins. */
  readonly column: number;
  /** Character length of the flagged span. */
  readonly length: number;
}

const PARENTHETICAL_ASIDE_MIN_CHARS = 8;

export function lint(body: string): LintMark[] {
  const marks: LintMark[] = [];
  const lines = body.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const lineNumber = i + 1;
    pushBullets(line, lineNumber, marks);
    pushBareUrls(line, lineNumber, marks);
    pushParentheticals(line, lineNumber, marks);
  }
  pushAcronyms(body, marks);
  return marks;
}

function pushBullets(line: string, lineNumber: number, marks: LintMark[]): void {
  // Lines that begin with `- `, `* `, or a numbered list marker such as `1. `.
  const match = /^(\s*)([-*]\s+|\d+\.\s+)/.exec(line);
  if (!match) return;
  const column = (match[1]?.length ?? 0) + 1;
  marks.push({
    ruleId: 'bullet-list-syntax',
    message:
      'Bullet-list syntax reads poorly as speech. Rewrite as prose sentences with connecting words.',
    line: lineNumber,
    column,
    length: match[2]?.length ?? 1,
  });
}

function pushBareUrls(line: string, lineNumber: number, marks: LintMark[]): void {
  const re = /\bhttps?:\/\/\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    marks.push({
      ruleId: 'bare-url',
      message:
        'Bare URL read aloud is rarely what you want. Say "our docs site" or spell out the domain.',
      line: lineNumber,
      column: m.index + 1,
      length: m[0].length,
    });
  }
}

function pushParentheticals(line: string, lineNumber: number, marks: LintMark[]): void {
  // Long parenthetical asides read as awkward pauses in spoken delivery.
  const re = /\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const inside = m[1] ?? '';
    if (inside.trim().length < PARENTHETICAL_ASIDE_MIN_CHARS) continue;
    marks.push({
      ruleId: 'parenthetical-aside',
      message:
        "Long parenthetical aside. Inline or move to a separate sentence — asides break the speaker's rhythm.",
      line: lineNumber,
      column: m.index + 1,
      length: m[0].length,
    });
  }
}

function pushAcronyms(body: string, marks: LintMark[]): void {
  // Find every 2–5-letter ALL-CAPS token. Flag the first occurrence whose
  // next non-whitespace isn't a matching `(...)` expansion. Later occurrences
  // are always allowed (the first pass bears the expansion).
  const seen = new Set<string>();
  // Match token with its preceding offset so we know where it starts.
  const tokenRe = /\b([A-Z]{2,5})\b/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(body)) !== null) {
    const token = m[1] ?? '';
    if (token === '') continue;
    if (seen.has(token)) continue;
    seen.add(token);
    // Skip common stopwords that happen to fit the shape (I, A, OK...).
    if (STOP_ACRONYMS.has(token)) continue;
    // Is there an expansion `(...)` right after? Allow up to 2 spaces between.
    const tail = body.slice(m.index + token.length, m.index + token.length + 2);
    if (tail.startsWith('(') || tail.startsWith(' (')) continue;
    const { line, column } = offsetToLineCol(body, m.index);
    marks.push({
      ruleId: 'acronym-without-expansion',
      message: `Acronym "${token}" has no expansion at first use. Say it in full, e.g. "${token} (what it stands for)".`,
      line,
      column,
      length: token.length,
    });
  }
}

const STOP_ACRONYMS = new Set(['OK', 'USA', 'UK', 'EU', 'AM', 'PM', 'TV', 'UI', 'UX']);

function offsetToLineCol(body: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset; i += 1) {
    if (body.charCodeAt(i) === 10 /* \n */) {
      line += 1;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
}
