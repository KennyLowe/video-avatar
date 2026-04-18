// Vite's `?raw` import suffix returns the file contents as a string at
// bundle time. Only the main/renderer bundles go through Vite, but the
// runner doesn't care where the string came from.

declare module '*.sql?raw' {
  const content: string;
  export default content;
}
