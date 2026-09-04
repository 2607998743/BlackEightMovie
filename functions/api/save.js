// POST /api/save  保存影片名修改到 KV（在线即时生效）
// body: {"url":"...","movie_name":"..."} 或 {"overrides":{"url":"name",...}}
export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
  try {
    const body = await request.json();
    const overrides = {};
    if (body && body.url && body.movie_name) overrides[body.url] = body.movie_name;
    if (body && body.overrides && typeof body.overrides === 'object') {
      Object.assign(overrides, body.overrides);
    }
    if (Object.keys(overrides).length === 0) {
      return json({ ok: false, msg: 'no data' }, 400);
    }
    // 读现有 overrides 并合并（只增不减，幂等）
    let existing = {};
    const raw = await env.BLACK_MOVIE_OVERRIDES.get('overrides');
    if (raw) { try { existing = JSON.parse(raw); } catch (e) {} }
    let changed = 0;
    for (const [k, v] of Object.entries(overrides)) {
      if (existing[k] !== v) { existing[k] = v; changed++; }
    }
    await env.BLACK_MOVIE_OVERRIDES.put('overrides', JSON.stringify(existing));
    return json({ ok: true, changed, total: Object.keys(existing).length });
  } catch (e) {
    return json({ ok: false, msg: String(e) }, 500);
  }
}
