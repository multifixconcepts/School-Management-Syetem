import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getNamespacedCookieAsync } from '@/lib/cookies';
import '@/app/api/_lib/undici';
import { normalizeBaseUrl, createTimeoutSignal } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken =
      cookieStore.get('accessToken')?.value ||
      cookieStore.get('tn_accessToken')?.value;
    const tenantId =
      (await getNamespacedCookieAsync('tenantId', 'tn_')) ||
      cookieStore.get('tn_tenantId')?.value ||
      cookieStore.get('tenantId')?.value;

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

    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    const baseUrl = normalizeBaseUrl(process.env.BACKEND_API_URL);
    const backendEndpoint = `${baseUrl}/academics/academic-grades${queryString ? '?' + queryString : ''}`;
    console.log('[Academic Grades API] Base URL:', baseUrl);
    console.log('[Academic Grades API] Backend URL:', backendEndpoint);

    const { signal, cancel } = createTimeoutSignal(90_000);
    const response = await fetch(backendEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Tenant-ID': tenantId,
        'Content-Type': 'application/json',
      },
      signal,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: 'Failed to fetch academic grades'
      }));
      cancel();
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    cancel();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Academic grades API error:', error);
    if (error?.name === 'AbortError') {
      return NextResponse.json({ message: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken =
      cookieStore.get('accessToken')?.value ||
      cookieStore.get('tn_accessToken')?.value;
    const tenantId =
      (await getNamespacedCookieAsync('tenantId', 'tn_')) ||
      cookieStore.get('tn_tenantId')?.value ||
      cookieStore.get('tenantId')?.value;

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

    const body = await request.json();
    const baseUrl = normalizeBaseUrl(process.env.BACKEND_API_URL);
    const backendEndpoint = `${baseUrl}/academics/academic-grades`;

    console.log('[Academic Grades API POST] Base URL:', baseUrl);
    console.log('[Academic Grades API POST] Backend URL:', backendEndpoint);
    console.log('[Academic Grades API POST] Tenant ID:', tenantId);

    const { signal, cancel } = createTimeoutSignal(90_000);
    const response = await fetch(backendEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Tenant-ID': tenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: 'Failed to create academic grade'
      }));
      cancel();
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    cancel();
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Academic grades POST error:', error);
    if (error?.name === 'AbortError') {
      return NextResponse.json({ message: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

