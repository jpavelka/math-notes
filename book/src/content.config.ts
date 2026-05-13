import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const sample = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './content' }),
  schema: z.object({
    title: z.string(),
    chapter: z.union([z.number(), z.string()]).optional(),
    order: z.number().optional(),
    section: z.number().optional(),
    pagefind: z.boolean().optional(),
  }),
});

export const collections = { sample };
