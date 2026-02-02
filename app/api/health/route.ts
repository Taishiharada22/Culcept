import { NextResponse } from 'next/server';
import monitoring from '@/lib/monitoring';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const metrics = await monitoring.runHealthCheck();

    return NextResponse.json({
      status: 'ok',
      metrics,
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}
