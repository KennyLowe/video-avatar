import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

// ESM exports from node:child_process are non-configurable, so we replace
// the whole module via vi.mock rather than spy on an individual export.

interface FakeChild extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  stdin: Writable;
  kill: (signal?: NodeJS.Signals | number) => boolean;
  killed: boolean;
}

function makeFakeChild(): FakeChild {
  const ev = new EventEmitter() as FakeChild;
  ev.stdout = new Readable({ read() {} });
  ev.stderr = new Readable({ read() {} });
  ev.stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  ev.killed = false;
  ev.kill = () => {
    ev.killed = true;
    return true;
  };
  return ev;
}

// Queue of children that spawn will hand out, in order.
const spawnQueue: FakeChild[] = [];
const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];

vi.mock('node:child_process', () => ({
  spawn: (command: string, args: readonly string[]) => {
    spawnCalls.push({ command, args });
    const child = spawnQueue.shift();
    if (!child) throw new Error('No fake child queued for spawn()');
    return child as unknown as ChildProcess;
  },
}));

// Import the module under test AFTER the mock is set up.
const claudeCode = await import('@main/providers/claudeCode.js');

beforeEach(() => {
  spawnQueue.length = 0;
  spawnCalls.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

// Readable#push emits 'data' asynchronously; let the IO tick so the wrapper's
// listener actually buffers before we emit 'close'. Using real-time
// microtask here means fake timers must only fake setTimeout / clearTimeout.
async function flushIO(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('claudeCode.invoke (JSON mode)', () => {
  it('resolves with parsed JSON on clean exit', async () => {
    const child = makeFakeChild();
    spawnQueue.push(child);

    const promise = claudeCode.invoke<{ ok: number }>({
      model: 'claude-opus-4-7',
      prompt: 'say ok',
      outputFormat: 'json',
    });

    child.stdout.push('{"ok":1}');
    child.stdout.push(null);
    await flushIO();
    child.emit('close', 0);

    const result = await promise;
    expect(result.parsed).toEqual({ ok: 1 });
    expect(result.raw).toBe('{"ok":1}');
    expect(spawnCalls[0]).toEqual({
      command: 'claude',
      args: expect.arrayContaining([
        '--print',
        '--output-format',
        'json',
        '--model',
        'claude-opus-4-7',
        'say ok',
      ]),
    });
  });

  it('rejects with invalid_json when stdout is not parseable', async () => {
    const child = makeFakeChild();
    spawnQueue.push(child);

    const promise = claudeCode.invoke({
      model: 'claude-opus-4-7',
      prompt: 'p',
      outputFormat: 'json',
    });

    child.stdout.push('hello not json');
    child.stdout.push(null);
    await flushIO();
    child.emit('close', 0);

    await expect(promise).rejects.toMatchObject({
      provider: 'claudeCode',
      code: 'invalid_json',
    });
  });

  it('rejects with non_zero_exit when the process exits !=0', async () => {
    const child = makeFakeChild();
    spawnQueue.push(child);

    const promise = claudeCode.invoke({
      model: 'claude-opus-4-7',
      prompt: 'p',
      outputFormat: 'json',
    });

    child.stderr.push('not logged in\n');
    child.stderr.push(null);
    await flushIO();
    child.emit('close', 1);

    await expect(promise).rejects.toMatchObject({
      provider: 'claudeCode',
      code: 'non_zero_exit',
      message: expect.stringContaining('not logged in'),
    });
  });

  it('rejects with not_installed when spawn fires ENOENT', async () => {
    const child = makeFakeChild();
    spawnQueue.push(child);

    const promise = claudeCode.invoke({
      model: 'claude-opus-4-7',
      prompt: 'p',
      outputFormat: 'json',
    });

    const err: NodeJS.ErrnoException = new Error('not found') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    child.emit('error', err);

    await expect(promise).rejects.toMatchObject({
      provider: 'claudeCode',
      code: 'not_installed',
      nextStep: expect.stringContaining('winget install'),
    });
  });

  it('times out when the child never closes', async () => {
    const child = makeFakeChild();
    spawnQueue.push(child);

    const promise = claudeCode.invoke({
      model: 'claude-opus-4-7',
      prompt: 'p',
      outputFormat: 'json',
      timeoutMs: 500,
    });

    // Make sure we attach the rejection handler before advancing timers.
    const caught = promise.catch((e) => e);
    await vi.advanceTimersByTimeAsync(600);
    const err = await caught;
    expect(err).toMatchObject({ provider: 'claudeCode', code: 'timeout' });
    expect(child.killed).toBe(true);
  });
});
