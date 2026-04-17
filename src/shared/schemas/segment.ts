import { z } from 'zod';

export const SegmentSchema = z.object({
  id: z.number().int(),
  sourcePath: z.string(),
  extractedPath: z.string(),
  inMs: z.number().int().nonnegative(),
  outMs: z.number().int().nonnegative(),
  createdAt: z.number().int(),
});
export type Segment = z.infer<typeof SegmentSchema>;
