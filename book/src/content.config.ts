import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { chapterSchema } from 'astro-math-book';

const sample = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './content' }),
  schema: chapterSchema,
});

export const collections = { sample };
