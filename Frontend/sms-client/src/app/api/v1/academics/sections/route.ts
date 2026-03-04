import { NextRequest, NextResponse } from 'next/server';
import '@/app/api/_lib/undici';
import { normalizeBaseUrl, createTimeoutSignal } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    console.log('[Sections API] Processing GET request');

    // Get authentication context
    const context = request.headers.get('x-auth-context') || 'DEFAULT';
    console.log('[Sections API] Auth context:', context);

    let tenantId: string | null = null;
    let accessToken: string | null = null;

    // Extract tenant ID and access token based on context
    if (context === 'SUPER_ADMIN') {
      tenantId = request.headers.get('x-tenant-id');
      accessToken = request.headers.get('x-access-token');
    } else if (context === 'TENANT') {
      const cookies = request.headers.get('cookie') || '';
      const tenantMatch = cookies.match(/tn_tenantId=([^;]+)/);
      const tokenMatch = cookies.match(/tn_accessToken=([^;]+)/);
      tenantId = tenantMatch ? tenantMatch[1] : null;
      accessToken = tokenMatch ? tokenMatch[1] : null;
    } else {
      // DEFAULT context
      const cookies = request.headers.get('cookie') || '';
      console.log('[Sections API] All cookies:', cookies);

      const tenantMatch = cookies.match(/tn_tenantId=([^;]+)/);
      const tokenMatch = cookies.match(/(?:^|; )accessToken=([^;]+)|tn_accessToken=([^;]+)/);

      tenantId = tenantMatch ? tenantMatch[1] : null;
      accessToken = tokenMatch ? (tokenMatch[1] || tokenMatch[2]) : null;
    }

    console.log('[Sections API] Retrieved tenantId from cookies:', tenantId);

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID not found' },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Access token not found' },
        { status: 401 }
      );
    }

    const baseUrl = normalizeBaseUrl(process.env.BACKEND_API_URL);

    const searchParams = request.nextUrl.searchParams;
    const skip = searchParams.get('skip') ?? '0';
    const limit = searchParams.get('limit') ?? '100';
    searchParams.set('skip', skip);
    searchParams.set('limit', limit);
    const queryString = searchParams.toString();

    // Make request to backend
    const backendUrl = `${baseUrl}/academics/sections${queryString ? '?' + queryString : ''}`;
    console.log('[Sections API] Base URL:', baseUrl);
    console.log('[Sections API] Backend URL:', backendUrl);
    console.log('[Sections API] Sending request to backend with X-Tenant-ID:', tenantId);

    const { signal, cancel } = createTimeoutSignal(90_000);
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Tenant-ID': tenantId,
        'Content-Type': 'application/json',
      },
      signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      cancel();
      console.error('[Sections API] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    cancel();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Sections API] Error:', error);
    if (error?.name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Sections API] Processing POST request');

    const context = request.headers.get('x-auth-context') || 'DEFAULT';
    let tenantId: string | null = null;
    let accessToken: string | null = null;

    if (context === 'SUPER_ADMIN') {
      tenantId = request.headers.get('x-tenant-id');
      accessToken = request.headers.get('x-access-token');
    } else if (context === 'TENANT') {
      const cookies = request.headers.get('cookie') || '';
      const tenantMatch = cookies.match(/tn_tenantId=([^;]+)/);
      const tokenMatch = cookies.match(/tn_accessToken=([^;]+)/);
      tenantId = tenantMatch ? tenantMatch[1] : null;
      accessToken = tokenMatch ? tokenMatch[1] : null;
    } else {
      const cookies = request.headers.get('cookie') || '';
      const tenantMatch = cookies.match(/tn_tenantId=([^;]+)/);
      const tokenMatch = cookies.match(/(?:^|; )accessToken=([^;]+)|tn_accessToken=([^;]+)/);
      tenantId = tenantMatch ? tenantMatch[1] : null;
      accessToken = tokenMatch ? (tokenMatch[1] || tokenMatch[2]) : null;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID not found' }, { status: 400 });
    }
    if (!accessToken) {
      return NextResponse.json({ error: 'Access token not found' }, { status: 401 });
    }

    const baseUrl = normalizeBaseUrl(process.env.BACKEND_API_URL);

    const backendUrl = `${baseUrl}/academics/sections`;
    console.log('[Sections API] Base URL:', baseUrl);
    console.log('[Sections API] Backend URL:', backendUrl);
    const body = await request.text();

    const { signal, cancel } = createTimeoutSignal(90_000);
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Tenant-ID': tenantId,
        'Content-Type': 'application/json',
      },
      body,
      signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      cancel();
      console.error('[Sections API] Backend error:', response.status, errorText);
      return NextResponse.json({ error: `Backend error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    cancel();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[Sections API] Error:', error);
    if (error?.name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

