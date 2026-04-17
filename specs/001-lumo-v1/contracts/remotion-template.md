# Contract: Remotion template

Every Remotion template — bundled or dropped into `<project>/templates/` — MUST
conform to this export shape. Templates that do not conform are flagged as
invalid with the specific missing export named and are not loadable.

## Required exports

```ts
import { z } from 'zod';
import type { ComponentType } from 'react';

export const schema: z.ZodObject<z.ZodRawShape>;

export const defaultProps: z.infer<typeof schema>;

export const durationInFrames: number | ((props: z.infer<typeof schema>) => number);

export const fps: number;

export const Composition: ComponentType<z.infer<typeof schema>>;
```

Additional conventions (non-load-bearing but recommended):
- `export const id: string` — stable identifier if a template file is renamed.
  If absent, the filename (without extension) is the id.
- `export const displayName: string` — for the template picker UI.
- `export const description: string` — shown in the picker sidebar.

## Loader behaviour

Templates are loaded from two roots:
1. Bundled: `resources/templates/*.tsx` (ships with the installer).
2. Per-project: `<project>/templates/*.tsx`.

For each `.tsx` file discovered:

1. The file is imported via the Remotion bundler, not via a dynamic `require`
   of a built path.
2. The loader checks each required export exists and has the expected shape.
   Missing or mistyped exports produce:
   ```ts
   { validity: `invalid-missing-${exportName}` }
   ```
3. `schema.parse(defaultProps)` MUST succeed. If it does not, the template is
   marked `invalid-defaultprops-fail-schema` with the validation error attached.
4. Valid templates are cached in memory; a file watcher invalidates the cache
   on change (dev only; in production templates are invalidated on project
   open).

## Prop filling via Claude Code

```ts
import { zodToJsonSchema } from 'zod-to-json-schema';

const jsonSchema = zodToJsonSchema(template.schema, template.id);

const resp = await claudeCode.invoke<unknown>({
  model: settings.defaultClaudeModel,         // 'claude-opus-4-7' by default
  systemPrompt: REMOTION_PROPS_SYSTEM_PROMPT,
  prompt: [
    userPrompt,
    `\nReturn JSON matching this schema:\n${JSON.stringify(jsonSchema, null, 2)}`,
    `\nStarting values:\n${JSON.stringify(startingProps ?? template.defaultProps, null, 2)}`,
  ].join('\n'),
  outputFormat: 'json',
});

try {
  return template.schema.parse(resp.parsed);
} catch (err) {
  // retry once with validation error appended
  const retry = await claudeCode.invoke<unknown>({
    model: settings.defaultClaudeModel,
    systemPrompt: REMOTION_PROPS_SYSTEM_PROMPT,
    prompt: [/* prior content */, `\nValidation error from your last response:\n${err.message}\nFix the JSON and return again.`].join('\n'),
    outputFormat: 'json',
  });
  return template.schema.parse(retry.parsed);  // second failure throws to caller
}
```

Failure path: after a second `schema.parse` failure, the UI surfaces the last
validation error and opens a JSON editor pre-populated with the second response.
The operator edits and submits; `schema.parse` is run on submit; only on
success is the template rendered.

## Render contract

```ts
await remotion.renderMedia({
  serveUrl: await remotion.bundleOnce(template.sourcePath),
  compositionId: template.id,
  inputProps: validatedProps,   // output of schema.parse
  outputPath: renderPath,
  codec: settings.defaultCodec,
  imageFormat: 'jpeg',
  jpegQuality: 80,
  audioCodec: 'aac',
  audioBitrate: '192k',
  onProgress: ({ renderedFrames, totalFrames }) => emit(jobId, { renderedFrames, totalFrames }),
  signal,
});
```

`renderPath` is `<project>/renders/<slug>-<iso-timestamp>.mp4` (colons replaced
with `-` for Windows filename safety).

## Security invariants (from constitution)

- **No `eval`**, **no `new Function`**, **no dynamic `require` of generated
  `.tsx`**. Template code is only ever loaded from files the operator can see
  on disk.
- Model-generated output is only ever a JSON object. A template's `Composition`
  component MUST NOT interpret any string field as executable code.
