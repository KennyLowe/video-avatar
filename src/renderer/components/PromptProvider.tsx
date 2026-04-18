import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
  type ChangeEvent,
  useEffect,
} from 'react';

// PromptProvider replaces Electron-sandbox-broken window.prompt / confirm
// with in-app modals that return a Promise. Mount once around the app;
// call usePrompt() / useConfirm() from any descendant.

interface PromptRequest {
  kind: 'prompt';
  message: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
}

interface ConfirmRequest {
  kind: 'confirm';
  message: string;
  resolve: (value: boolean) => void;
}

type Request = PromptRequest | ConfirmRequest;

interface Ctx {
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
  confirm: (message: string) => Promise<boolean>;
}

const PromptCtx = createContext<Ctx | null>(null);

export function PromptProvider({ children }: { children: ReactNode }): JSX.Element {
  const [current, setCurrent] = useState<Request | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const prompt = useCallback(
    (message: string, defaultValue = ''): Promise<string | null> =>
      new Promise<string | null>((resolve) => {
        setDraft(defaultValue);
        setCurrent({ kind: 'prompt', message, defaultValue, resolve });
      }),
    [],
  );

  const confirm = useCallback(
    (message: string): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setCurrent({ kind: 'confirm', message, resolve });
      }),
    [],
  );

  const close = useCallback((answer: string | boolean | null): void => {
    setCurrent((req) => {
      if (req === null) return null;
      if (req.kind === 'prompt') req.resolve(typeof answer === 'string' ? answer : null);
      else req.resolve(answer === true);
      return null;
    });
    setDraft('');
  }, []);

  useEffect(() => {
    if (current?.kind === 'prompt') {
      // Autofocus the input on open so the operator can start typing
      // immediately — same ergonomic as native prompt.
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [current]);

  const value = useMemo<Ctx>(() => ({ prompt, confirm }), [prompt, confirm]);

  return (
    <PromptCtx.Provider value={value}>
      {children}
      {current !== null ? (
        <div className="lumo-modal" role="presentation">
          <div
            className="lumo-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-label={current.message}
          >
            <p>{current.message}</p>
            {current.kind === 'prompt' ? (
              <input
                ref={inputRef}
                className="lumo-input"
                value={draft}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') close(draft);
                  else if (e.key === 'Escape') close(null);
                }}
              />
            ) : null}
            <div className="lumo-modal__actions">
              <button type="button" onClick={() => close(current.kind === 'prompt' ? null : false)}>
                Cancel
              </button>
              <button
                type="button"
                className="lumo-primary"
                onClick={() => close(current.kind === 'prompt' ? draft : true)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PromptCtx.Provider>
  );
}

export function usePrompt(): Ctx['prompt'] {
  const ctx = useContext(PromptCtx);
  if (ctx === null) throw new Error('usePrompt must be used inside <PromptProvider>');
  return ctx.prompt;
}

export function useConfirm(): Ctx['confirm'] {
  const ctx = useContext(PromptCtx);
  if (ctx === null) throw new Error('useConfirm must be used inside <PromptProvider>');
  return ctx.confirm;
}
