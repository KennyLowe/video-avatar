// Minimal type shim for the `ffprobe-static` package — it only exports the
// resolved binary path. Variants: CommonJS returns a string, ESM sometimes
// wraps it in `{ path, default }`. Accept both.
declare module 'ffprobe-static' {
  const value: string | { path?: string; default?: string };
  export default value;
}
