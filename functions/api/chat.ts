interface Env {
  DEEPSEEK_API_KEY: string;
  // Cloudflare Dashboard -> Workers & Pages -> KV 에서 생성 후 바인딩 필요:
  //   Variable name: RATE_LIMIT_KV
  // (KV 바인딩이 없으면 제한 없이 통과 — 서비스 중단 방지 폴백)
  RATE_LIMIT_KV?: { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> };
}

// ── 사용량 제한 설정 ──
const RATE_LIMIT_PER_DAY = 100;        // IP당 1일 최대 요청 수
const RATE_LIMIT_WINDOW_SECONDS = 86400;

async function checkRateLimit(env: Env, clientIp: string): Promise<{ allowed: boolean; remaining: number }> {
  const kv = env.RATE_LIMIT_KV;
  if (!kv) return { allowed: true, remaining: -1 }; // KV 미바인딩 시 제한 스킵

  const now = Math.floor(Date.now() / 1000);
  const key = `rl:${clientIp}:${Math.floor(now / RATE_LIMIT_WINDOW_SECONDS)}`;

  try {
    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= RATE_LIMIT_PER_DAY) {
      return { allowed: false, remaining: 0 };
    }
    // TTL은 윈도우 종료까지 남은 시간 + 버퍼
    const windowEnd = (Math.floor(now / RATE_LIMIT_WINDOW_SECONDS) + 1) * RATE_LIMIT_WINDOW_SECONDS;
    await kv.put(key, String(count + 1), { expirationTtl: windowEnd - now + 60 });
    return { allowed: true, remaining: RATE_LIMIT_PER_DAY - count - 1 };
  } catch {
    return { allowed: true, remaining: -1 }; // KV 오류 시 서비스 지속 우선
  }
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "X-RateLimit-Limit": String(RATE_LIMIT_PER_DAY),
  };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const apiKey = env.DEEPSEEK_API_KEY || env.DEEPSEEK_KEY || env.API_KEY || env.deepseek_api_key;

    if (!apiKey) {
      const availableKeys = Object.keys(env).join(", ");
      return new Response(JSON.stringify({
        error: "DeepSeek API key is not configured.",
        debug: `Available env keys: [${availableKeys}]. Please set DEEPSEEK_API_KEY in Cloudflare Pages Settings -> Environment variables and REDEPLOY.`,
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // ── 사용량 제한 검사 ──
    const clientIp = getClientIp(request);
    const rl = await checkRateLimit(env, clientIp);
    if (!rl.allowed) {
      return new Response(JSON.stringify({
        error: "오늘의 사용량을 모두 사용했어요. 내일 다시 만나요 💤",
        code: "RATE_LIMITED",
      }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS),
          ...corsHeaders(),
        },
      });
    }

    const body = await request.json();

    // ── 입력 크기 제한 (악용 방지) ──
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 60) {
      return new Response(JSON.stringify({ error: "Invalid messages payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
    for (const m of messages) {
      if (typeof m?.content !== "string" || m.content.length > 4000) {
        return new Response(JSON.stringify({ error: "Message too long." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
    }

    // DeepSeek API 호출
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: typeof body.model === "string" ? body.model : "deepseek-chat",
        messages,
        max_tokens: Math.min(Number(body.max_tokens) || 2048, 2048),
        temperature: Number(body.temperature) ?? 0.9,
        stream: false,
      }),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid response from DeepSeek API", details: responseText }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": String(rl.remaining),
        ...corsHeaders(),
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
};
