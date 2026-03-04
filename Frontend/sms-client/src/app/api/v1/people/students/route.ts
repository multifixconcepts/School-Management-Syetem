import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import '@/app/api/_lib/undici';
import { normalizeBaseUrl, createTimeoutSignal } from '@/app/api/_lib/http';

// Helper function to get namespaced cookies - now async
async function getNamespacedCookie(key: string, namespace: string = 'tn_'): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(`${namespace}${key}`)?.value;
}

// Helper function to validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Helper function to get tenant UUID by domain
async function getTenantUUIDByDomain(domain: string): Promise<string | null> {
  try {
    // Normalize backend URL to prevent double /api/v1
    let baseUrl = process.env.BACKEND_API_URL || '';
    if (!baseUrl.endsWith('/api/v1')) {
      baseUrl = baseUrl.replace(/\/+$/, '') + '/api/v1';
    }

    const response = await fetch(`${baseUrl}/tenants/?domain=${encodeURIComponent(domain)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error(`Failed to fetch tenant by domain ${domain}:`, response.status);
      return null;
    }

    const data = await response.json();
    const tenants = Array.isArray(data) ? data : [data];
    return tenants.length > 0 && tenants[0].id ? tenants[0].id : null;
  } catch (error) {
    console.error('Error fetching tenant by domain:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();

    // Get tenant ID - prioritize X-Tenant-ID header, then namespaced cookies, then plain cookies
    let tenantId = request.headers.get('X-Tenant-ID') ||
      cookieStore.get('tn_tenantId')?.value ||
      cookieStore.get('tenantId')?.value;

    // Get access token - prioritize Authorization header, then namespaced cookies, then plain cookies
    let accessToken = request.headers.get('Authorization')?.replace('Bearer ', '') ||
      cookieStore.get('tn_accessToken')?.value ||
      cookieStore.get('accessToken')?.value;

    // Validate tenant ID as UUID
    if (tenantId && !isValidUUID(tenantId)) {
      console.log(`[Students API] Invalid tenantId format: ${tenantId}`);
      return NextResponse.json(
        { error: 'Invalid tenant ID format' },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if tenantId exists
    if (!tenantId) {
      return NextResponse.json(
        { message: 'Tenant context required - no tenant ID found in cookies' },
        { status: 400 }
      );
    }

    // Forward query parameters with safe defaults to cap payload size
    const params = request.nextUrl.searchParams;
    const skip = params.get('skip') ?? '0';
    const limit = params.get('limit') ?? '100';
    params.set('skip', skip);
    params.set('limit', limit);
    const queryString = params.toString();

    console.log(`[Students API] Sending request to backend with X-Tenant-ID: ${tenantId}`);

    const baseUrl = normalizeBaseUrl(process.env.BACKEND_API_URL);
    const { signal, cancel } = createTimeoutSignal(90_000);
    const response = await fetch(`${baseUrl}/people/students${queryString ? `?${queryString}` : ''}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Tenant-ID': tenantId,
          'Content-Type': 'application/json',
        },
        signal,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to fetch students' }));
      cancel();
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    cancel();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in students API route:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Get authentication token and tenant ID from cookies with fallback
    const cookieStore = await cookies();
    const accessToken =
      (await getNamespacedCookie('accessToken')) ||
      cookieStore.get('accessToken')?.value ||
      request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ||
      null;

    let tenantId =
      (await getNamespacedCookie('tenantId')) ||
      cookieStore.get('tenantId')?.value ||
      request.headers.get('X-Tenant-ID') ||
      null;

    // Add debugging
    console.log(`[Students API POST] Retrieved tenantId from cookies: ${tenantId}`);
    console.log(`[Students API POST] All cookies:`, cookieStore.getAll().map(c => `${c.name}=${c.value}`).join(', '));

    if (!accessToken) {
      return NextResponse.json(
        { message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if tenantId exists
    if (!tenantId) {
      return NextResponse.json(
        { message: 'Tenant context required - no tenant ID found in cookies' },
        { status: 400 }
      );
    }

    // If tenantId is not a valid UUID, try to resolve it by domain
    if (tenantId && !isValidUUID(tenantId)) {
      console.log(`[Students API POST] TenantId "${tenantId}" is not a UUID, looking up by domain`);
      const resolvedTenantId = await getTenantUUIDByDomain(tenantId);

      if (!resolvedTenantId) {
        return NextResponse.json(
          { message: 'Invalid tenant context - could not resolve tenant UUID' },
          { status: 400 }
        );
      }

      tenantId = resolvedTenantId;
      console.log(`[Students API POST] Resolved tenant UUID: ${tenantId}`);
    }

    // Add tenant_id to the request body
    const requestBody = {
      ...body,
      tenant_id: tenantId
    };

    console.log(`[Students API POST] Sending request to backend with X-Tenant-ID: ${tenantId}`);

    const baseUrl = normalizeBaseUrl(process.env.BACKEND_API_URL);
    const { signal, cancel } = createTimeoutSignal(90_000);
    const response = await fetch(`${baseUrl}/people/students`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Tenant-ID': tenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to create student' }));
      cancel();
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    cancel();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating student:', error);
    return NextResponse.json(
      { message: 'Failed to create student' },
      { status: 500 }
    );
  }
}

