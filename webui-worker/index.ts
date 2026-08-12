// WebUI静的配信Worker（Cloudflare Workers 静的アセット）
export default {
  fetch(request: Request, env: { ASSETS: Fetcher }): Promise<Response> {
    const url = new URL(request.url);
    // ルート表示はモックアップビューア
    if (url.pathname === "/") {
      url.pathname = "/mockup.html";
      return env.ASSETS.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
