import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const chapters = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/chapters' }),
  schema: z.object({
    title: z.string(),
    chapter: z.union([z.number(), z.string()]).optional(),
    section: z.number().optional(),
  }),
});

export const collections = { chapters };
