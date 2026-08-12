// WebUI静的配信Worker（Cloudflare Workers 静的アセット）
export default {
  async fetch(request: Request, env: { ASSETS: Fetcher }): Promise<Response> {
    const url = new URL(request.url);
    // ルートは説明・一覧ページ（index.html）を明示的に配信し、キャッシュを無効化
    const target = url.pathname === "/" ? "/index.html" : url.pathname;
    const res = await env.ASSETS.fetch(new Request(new URL(target, request.url), request));
    const headers = new Headers(res.headers);
    if (target.endsWith(".html") || target === "/") {
      headers.set("cache-control", "no-store, max-age=0");
      headers.set("expires", "0");
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
