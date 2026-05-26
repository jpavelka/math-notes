import { z } from 'zod';

export const chapterSchema = z.object({
  title: z.string(),
  chapter: z.union([z.number(), z.string()]).optional(),
  bookPart: z.string().optional(),
  chapterId: z.string().optional(),
  order: z.number().optional(),
  section: z.number().optional(),
  pagefind: z.boolean().optional(),
});
