import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import '@/app/api/_lib/undici';
import { normalizeBaseUrl, createTimeoutSignal } from '@/app/api/_lib/http';

// Helper function to get namespaced cookies
async function getNamespacedCookie(key: string, namespace: string = 'tn_'): Promise<string | undefined> {
    const cookieStore = await cookies();
    return cookieStore.get(`${namespace}${key}`)?.value;
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

        console.log(`[Students Bulk API] Proxying request to backend with Tenant ID: ${tenantId}`);

        const baseUrl = normalizeBaseUrl(process.env.BACKEND_API_URL);
        const { signal, cancel } = createTimeoutSignal(120_000); // Higher timeout for bulk operations

        const response = await fetch(`${baseUrl}/people/students/bulk`, {
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
            const errorData = await response.json().catch(() => ({ message: 'Failed to create students in bulk' }));
            cancel();
            return NextResponse.json(errorData, { status: response.status });
        }

        const data = await response.json();
        cancel();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in students bulk creation API route:', error);
        return NextResponse.json(
            { message: 'Internal server error in bulk creation proxy' },
            { status: 500 }
        );
    }
}
