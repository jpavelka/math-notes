import type { APIRoute } from 'astro';
import { manifest } from '../manifest.ts';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
