// E2E スモーク: 主要シナリオをAPIで一巡する（デモデータ投入済みが前提）
// 使い方: node scripts/e2e-smoke.mjs [--url http://localhost:8790]
const url = (process.argv.indexOf("--url") >= 0 ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:8790");
const failures = [];

function check(name, cond, extra = "") {
  if (cond) console.log(`  ok: ${name}`);
  else {
    console.error(`  NG: ${name} ${extra}`);
    failures.push(name);
  }
}

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* noop */
  }
  return { status: res.status, body: json, headers: res.headers };
}

async function login(userId) {
  const r = await api("/api/auth/login", { method: "POST", body: { userId } });
  return { status: r.status, token: r.body?.token, user: r.body?.user };
}

console.log(`E2E smoke against ${url}`);

// 1. health
const health = await api("/api/health");
check("health 200", health.status === 200);

// 2. login: 取締役（議決権あり）・監査役（議決権なし）・内部監査
const director = await login("user-director-1");
const kansa = await login("user-kansa-1");
const auditor = await login("user-auditor-1");
const secretariat = await login("user-secretariat-1");
check("director login", director.status === 200 && !!director.token);
check("kansa login", kansa.status === 200 && !!kansa.token);
check("auditor login", auditor.status === 200 && !!auditor.token);
check("secretariat login", secretariat.status === 200 && !!secretariat.token);

// 3. RBAC: 監査役は議決権を持たない（permissions に vote:cast がない）
const me = await api("/api/auth/me", { token: kansa.token });
check("kansa me 200", me.status === 200);
check("kansa no vote permission", !(me.body?.permissions ?? []).includes("vote:cast"), JSON.stringify(me.body?.permissions));

// 4. 議案一覧（権限内）
const agendas = await api("/api/agenda-items", { token: director.token });
check("agenda list 200", agendas.status === 200);
check("agenda list has data", Array.isArray(agendas.body?.items) && agendas.body.items.length > 0);

// 5. 議案詳細（決議済みのものを探す）
const finalized = (agendas.body?.items ?? []).find((a) => a.status === "finalized" || a.decisionStatus === "finalized");
check("finalized agenda exists", !!finalized, JSON.stringify(agendas.body?.items?.map((a) => a.status)));
if (finalized) {
  const detail = await api(`/api/agenda-items/${finalized.id}`, { token: director.token });
  check("finalized agenda detail 200", detail.status === 200);
  check(
    "manifest linked",
    !!detail.body?.item?.decision?.evidence_manifest_id || !!detail.body?.item?.decision?.evidenceManifestId || !!detail.body?.item?.evidenceManifest,
    JSON.stringify(detail.body?.item?.decision ?? {}),
  );
  const manifestId = detail.body?.item?.decision?.evidence_manifest_id ?? detail.body?.item?.decision?.evidenceManifestId ?? detail.body?.item?.evidenceManifest?.id;
  if (manifestId) {
    const m = await api(`/api/manifests/${manifestId}/verify`, { token: director.token, method: "POST" });
    check("manifest verify 200", m.status === 200);
    check("manifest verify valid", m.body?.item?.valid === true, JSON.stringify(m.body));
  }
}

// 6. 監査ログチェーン検証
const chain = await api("/api/audit-events/verify-chain", { token: kansa.token });
check("audit chain verify 200", chain.status === 200);
check("audit chain valid", chain.body?.valid === true, JSON.stringify(chain.body));

// 7. SoD: 内部監査担当が自分自身の調書へレビュー依頼 → 409
const workpapers = await api("/api/engagements", { token: auditor.token });
check("engagements 200", workpapers.status === 200);
const eng = (workpapers.body?.items ?? [])[0];
if (eng) {
  const engDetail = await api(`/api/engagements/${eng.id}`, { token: auditor.token });
  const wp = (engDetail.body?.item?.procedures ?? []).flatMap((p) => p.workpapers ?? []).find((w) => w.author_id === auditor.user?.id);
  check("own workpaper exists", !!wp);
  if (wp) {
    const req = await api(`/api/workpapers/${wp.id}/review-requests`, { token: auditor.token, method: "POST", body: {} });
    check("self review-request rejected 409", req.status === 409, `${req.status} ${JSON.stringify(req.body)}`);
  }
}

// 8. AI草案: 出典不足（パッケージ未固定の議案）は 422
const draftTarget = (agendas.body?.items ?? []).find((a) => a.status === "draft" || a.status === "created");
if (draftTarget) {
  const ai = await api("/api/ai/drafts", { token: director.token, method: "POST", body: { agendaItemId: draftTarget.id } });
  check("AI draft 422 when no sources", ai.status === 422, `${ai.status} ${JSON.stringify(ai.body)}`);
}

// 9. 法的保全中の廃棄候補 → 409
const disposals = await api("/api/disposals", { token: secretariat.token });
const held = (disposals.body?.items ?? []).find((d) => d.status === "requested" || d.status === "pending_approval");
if (held) {
  const exec = await api(`/api/disposals/${held.id}/execute`, { token: secretariat.token, method: "POST" });
  check("disposal execute blocked by legal hold", exec.status === 409, `${exec.status} ${JSON.stringify(exec.body)}`);
}

// 10. CSV
const csv = await fetch(`${url}/api/exports/agenda-items.csv`, { headers: { authorization: `Bearer ${director.token}` } });
check("agenda CSV 200", csv.status === 200);
check("agenda CSV body", (await csv.text()).length > 50);

// 11. 検索
const search = await api("/api/search?q=株式", { token: director.token });
check("search 200", search.status === 200);
check("search has items", (search.body?.items?.length ?? 0) > 0);

// 12. ダッシュボード
const kpi = await api("/api/dashboard/kpis", { token: director.token });
check("kpis 200", kpi.status === 200);
check("kpis have keys", !!kpi.body?.kpis && Object.keys(kpi.body.kpis).length > 0);

if (failures.length) {
  console.error(`\nFAILED: ${failures.length}\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nE2E smoke: all checks passed");
