// Same-origin proxy: forwards the Next.js server to the internal issuer
// (127.0.0.1:4001). Keeps membership endpoints off the public internet.
const TARGET = process.env.ISSUER_INTERNAL_URL ?? "http://127.0.0.1:4001";

async function proxy(req: Request, trailing: string[]): Promise<Response> {
  const url = new URL(req.url);
  const target = `${TARGET}/${trailing.join("/")}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");

  const init: RequestInit = { method: req.method, headers, cache: "no-store" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const contentType = req.headers.get("content-type") ?? "";
    init.body = contentType.includes("application/json")
      ? await req.text()
      : await req.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}