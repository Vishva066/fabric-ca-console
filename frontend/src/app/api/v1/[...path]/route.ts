import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Reads FABRIC_CA_API_URL at runtime and proxies the browser request to the Go backend.
async function proxyRequest(req: NextRequest, path: string[]): Promise<Response> {
  const backendUrl = process.env.FABRIC_CA_API_URL;

  if (!backendUrl) {
    return Response.json({ error: "FABRIC_CA_API_URL is not set" }, { status: 500 });
  }

  try {
    const url = `${backendUrl}/api/v1/${path.join("/")}${req.nextUrl.search}`;
    const hasBody = !["GET", "HEAD"].includes(req.method);

    const upstream = await fetch(url, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy request failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  return proxyRequest(req, await ctx.params.then((p) => p.path));
}
export async function POST(req: NextRequest, ctx: RouteContext) {
  return proxyRequest(req, await ctx.params.then((p) => p.path));
}
export async function PUT(req: NextRequest, ctx: RouteContext) {
  return proxyRequest(req, await ctx.params.then((p) => p.path));
}
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return proxyRequest(req, await ctx.params.then((p) => p.path));
}