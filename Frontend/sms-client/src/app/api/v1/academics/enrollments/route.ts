import { NextRequest, NextResponse } from 'next/server';
import '@/app/api/_lib/undici';
import { normalizeBaseUrl, createTimeoutSignal } from '@/app/api/_lib/http';

export async function GET(request: NextRequest) {
  try {
    console.log('[Enrollments API] Processing GET request');

    // Get search parameters
    const { searchParams } = new URL(request.url);
    const skip = searchParams.get('skip') || '0';
    const limit = searchParams.get('limit') || '10';
    const academic_year_id = searchParams.get('academic_year_id');
    const grade_id = searchParams.get('grade_id');
    const section_id = searchParams.get('section_id');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    // Get authentication context
    const context = request.headers.get('x-auth-context') || 'DEFAULT';
    console.log('[Enrollments API] Auth context:', context);

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

      const tenantMatch = cookies.match(/tn_tenantId=([^;]+)/);
      const tokenMatch = cookies.match(/(?:^|; )accessToken=([^;]+)|tn_accessToken=([^;]+)/);

      tenantId = tenantMatch ? tenantMatch[1] : null;
      accessToken = tokenMatch ? (tokenMatch[1] || tokenMatch[2]) : null;
    }

    console.log('[Enrollments API] Retrieved tenantId from cookies:', tenantId);

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

    // Build query parameters
    const queryParams = new URLSearchParams({
      skip,
      limit,
    });

    if (academic_year_id) queryParams.append('academic_year_id', academic_year_id);
    if (grade_id) queryParams.append('grade_id', grade_id);
    if (section_id) queryParams.append('section_id', section_id);
    if (status) queryParams.append('status', status);
    if (search) queryParams.append('search', search);

    // Make request to backend
    const baseUrl = normalizeBaseUrl(process.env.BACKEND_API_URL);
    const backendUrl = `${baseUrl}/academics/enrollments?${queryParams}`;
    console.log('[Enrollments API] Sending request to backend with X-Tenant-ID:', tenantId);

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
      console.error('[Enrollments API] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    cancel();
    return NextResponse.json(data);

  } catch (error) {
    console.error('[Enrollments API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Enrollments API] Processing POST request');

    // Get authentication context
    const context = request.headers.get('x-auth-context') || 'DEFAULT';
    console.log('[Enrollments API] Auth context:', context);

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

      const tenantMatch = cookies.match(/tn_tenantId=([^;]+)/);
      const tokenMatch = cookies.match(/(?:^|; )accessToken=([^;]+)|tn_accessToken=([^;]+)/);

      tenantId = tenantMatch ? tenantMatch[1] : null;
      accessToken = tokenMatch ? (tokenMatch[1] || tokenMatch[2]) : null;
    }

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

    // Get request body
    const body = await request.json();

    // Make request to backend
    const baseUrl = normalizeBaseUrl(process.env.BACKEND_API_URL);
    const backendUrl = `${baseUrl}/academics/enrollments`;
    console.log('[Enrollments API] Creating enrollment with X-Tenant-ID:', tenantId);

    const { signal, cancel } = createTimeoutSignal(90_000);
    const response = await fetch(backendUrl, {
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
      // Forward backend error details instead of a generic message
      const contentType = response.headers.get('content-type') || '';
      let errorData: any = null;

      if (contentType.includes('application/json')) {
        errorData = await response.json().catch(() => null);
      } else {
        const text = await response.text().catch(() => '');
        errorData = text ? { detail: text } : null;
      }

      cancel();
      console.error('[Enrollments API] Backend error:', response.status, errorData || response.statusText);
      return NextResponse.json(
        errorData || { error: `Backend error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    cancel();
    return NextResponse.json(data);

  } catch (error) {
    console.error('[Enrollments API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

