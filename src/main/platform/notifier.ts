import { Notification } from 'electron';

// Thin wrapper around Electron's native Notification API. On Windows this
// surfaces as a toast. Kept isolated so tests can stub the native binding.

export interface NotifyOptions {
  title: string;
  body: string;
  onClick?: () => void;
  silent?: boolean;
}

export function notify(opts: NotifyOptions): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: opts.title,
    body: opts.body,
    silent: opts.silent ?? false,
  });
  if (opts.onClick) n.on('click', opts.onClick);
  n.show();
}
