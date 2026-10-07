import type { MetadataRoute } from 'next';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  let events: { slug: string; updated_at: Date }[] = [];
  try {
    events = [...(await sql<{ slug: string; updated_at: Date }[]>`
      select slug, updated_at from events
      where status = 'approved' and starts_on >= current_date
      order by starts_on limit 5000`)];
  } catch {
    // A sitemap is not worth failing a deploy over.
  }

  return [
    { url: site, changeFrequency: 'daily', priority: 1 },
    { url: `${site}/about`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${site}/communities`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${site}/communities/volleyball`, changeFrequency: 'weekly', priority: 0.7 },
    ...events.map((e) => ({
      url: `${site}/events/${e.slug}`,
      lastModified: e.updated_at,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
