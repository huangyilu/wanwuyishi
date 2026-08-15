// Supabase Edge Function: chat-proxy
//
// 仅做「大模型中继 + 藏 key」，不碰 Supabase 业务数据。
// 默认开启 JWT 校验（verifyJWT=true），只有登录用户能调用，天然按账号限流。
//
// 前端调用（走已登录的 supabase client，自动带用户 JWT）：
//   supabase.functions.invoke('chat-proxy', { body: { messages, tools, model } })
//
// 部署：
//   supabase functions deploy chat-proxy
//   supabase secrets set DEEPSEEK_API_KEY=sk-xxxx

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const ALLOWED_MODELS = ['deepseek-chat', 'deepseek-reasoner'];
const DEFAULT_MODEL = 'deepseek-chat';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const auth = req.headers.get('authorization');
    if (!auth) return json({ error: 'Missing authorization' }, 401);

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY');
    if (!apiKey) return json({ error: 'Server not configured (DEEPSEEK_API_KEY missing)' }, 500);

    const body = await req.json().catch(() => ({}));
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages must be a non-empty array' }, 400);
    }

    const model =
      typeof body.model === 'string' && ALLOWED_MODELS.includes(body.model)
        ? body.model
        : DEFAULT_MODEL;

    const upstream = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: Array.isArray(body.tools) ? body.tools : undefined,
        tool_choice: body.tool_choice ?? 'auto',
        temperature: typeof body.temperature === 'number' ? body.temperature : 0.2,
        stream: false,
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return json(
        { error: data?.error?.message ?? 'Upstream error', detail: data },
        upstream.status,
      );
    }
    return json(data);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
