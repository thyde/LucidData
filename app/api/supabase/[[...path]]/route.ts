import { NextRequest, NextResponse } from 'next/server';

/**
 * Supabase Proxy API Route
 *
 * Proxies all Supabase requests through Next.js server to hide internal infrastructure.
 * Uses optional catch-all route [[...path]] to handle both /api/supabase and /api/supabase/*
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';

async function proxyRequest(request: NextRequest) {
  try {
    // Extract path segments (may be undefined for /api/supabase root)
    const url = new URL(request.url);
    const pathMatch = url.pathname.match(/^\/api\/supabase\/?(.*)$/);
    const pathSegments = pathMatch?.[1] || '';

    // Construct target URL
    const targetUrl = `${SUPABASE_URL}/${pathSegments}${url.search}`;

    console.log(`[Supabase Proxy] ${request.method} ${url.pathname}${url.search} → ${targetUrl}`);

    // Prepare headers, removing host and other problematic headers
    const headers = new Headers();
    request.headers.forEach((value, key) => {
      // Skip headers that might cause issues
      if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // Add/override host for Supabase
    const supabaseHost = new URL(SUPABASE_URL).host;
    headers.set('host', supabaseHost);

    // Prepare request options
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      redirect: 'manual', // Handle redirects manually
    };

    // Add body for methods that support it
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const body = await request.text();
        if (body) {
          fetchOptions.body = body;
        }
      } catch (e) {
        console.error('[Supabase Proxy] Error reading request body:', e);
      }
    }

    // Forward request to Supabase
    const response = await fetch(targetUrl, fetchOptions);

    // Get response body
    const responseData = await response.arrayBuffer();

    // Prepare response headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Forward most headers
      if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // Add CORS headers for browser requests
    // Note: Using specific origin instead of * to allow credentials (cookies)
    const origin = request.headers.get('origin') || '*';
    responseHeaders.set('Access-Control-Allow-Origin', origin);
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');

    console.log(`[Supabase Proxy] Response: ${response.status} ${response.statusText}`);

    // Return proxied response
    return new NextResponse(responseData, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[Supabase Proxy] Error:', error);
    return NextResponse.json(
      {
        error: 'Proxy error',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Failed to connect to Supabase. Ensure Supabase is running on http://127.0.0.1:54321'
      },
      { status: 500 }
    );
  }
}

// Handle all HTTP methods
export async function GET(request: NextRequest) {
  return proxyRequest(request);
}

export async function POST(request: NextRequest) {
  return proxyRequest(request);
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request);
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request);
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request);
}

export async function OPTIONS(request: NextRequest) {
  // Handle CORS preflight
  const origin = request.headers.get('origin') || '*';
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    },
  });
}
