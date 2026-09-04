// GET /api/overrides  返回所有影片名修改记录（KV）
export async function onRequestGet(context) {
  const { env } = context;
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
  try {
    const raw = await env.BLACK_MOVIE_OVERRIDES.get('overrides');
    const overrides = raw ? JSON.parse(raw) : {};
    return json({ overrides });
  } catch (e) {
    return json({ ok: false, msg: String(e) }, 500);
  }
}
