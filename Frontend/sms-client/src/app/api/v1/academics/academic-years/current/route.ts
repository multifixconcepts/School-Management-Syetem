import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import '@/app/api/_lib/undici';
import { normalizeBaseUrl, createTimeoutSignal } from '@/app/api/_lib/http';
import { getNamespacedCookie } from '@/lib/cookies';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('accessToken')?.value;
    const tenantId = await getNamespacedCookie(cookieStore, 'tenantId');

    if (!accessToken) {
      return NextResponse.json(
        { message: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { message: 'Tenant context required' },
        { status: 400 }
      );
    }

    console.log(`[Current Academic Year API] Sending request to backend with X-Tenant-ID: ${tenantId}`);

    const baseUrl = normalizeBaseUrl(process.env.BACKEND_API_URL);
    const { signal, cancel } = createTimeoutSignal(90_000);
    const response = await fetch(`${baseUrl}/academics/academic-years/current`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Tenant-ID': tenantId,
        'Content-Type': 'application/json',
      },
      signal,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to fetch current academic year' }));
      cancel();
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    cancel();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in current academic year API route:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

