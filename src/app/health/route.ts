import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Uptime probe for the Phase 1 health monitoring requirement.
 * Returns 200 only when the database actually answers.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const [row] = await sql<{ events: number }[]>`
      select count(*)::int as events from events where status = 'approved'`;
    return Response.json(
      {
        status: 'ok',
        database: 'up',
        approved_events: row?.events ?? 0,
        latency_ms: Date.now() - startedAt,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        status: 'error',
        database: 'down',
        message: error instanceof Error ? error.message : 'unknown',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
