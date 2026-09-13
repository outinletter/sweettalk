interface Env {
  DEEPSEEK_API_KEY: string;
  // Create and bind this in Cloudflare Dashboard -> Workers & Pages -> KV:
  //   Variable name: RATE_LIMIT_KV
  // If KV is not bound, requests pass without limits as a service continuity fallback.
  RATE_LIMIT_KV?: { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> };
}

// ── Rate limit configuration ──
const RATE_LIMIT_PER_DAY = 100;        // Maximum requests per IP per day
const RATE_LIMIT_WINDOW_SECONDS = 86400;
const SAFETY_POLICY = `Safety policy: This is a 14+ service. Never generate sexual, erotic, suggestive, exploitative, or pornographic content. Never generate romantic or sexual content involving anyone under 18. Do not encourage emotional dependency, exclusivity, secrecy, isolation, or treating the AI as a real person. If the user mentions self-harm, suicide, abuse, or immediate danger, respond empathetically and direct them to a trusted person and local emergency/crisis services without providing instructions or methods.`;

async function checkRateLimit(env: Env, clientIp: string): Promise<{ allowed: boolean; remaining: number }> {
  const kv = env.RATE_LIMIT_KV;
  if (!kv) return { allowed: true, remaining: -1 }; // Skip limits when KV is not bound

  const now = Math.floor(Date.now() / 1000);
  const key = `rl:${clientIp}:${Math.floor(now / RATE_LIMIT_WINDOW_SECONDS)}`;

  try {
    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= RATE_LIMIT_PER_DAY) {
      return { allowed: false, remaining: 0 };
    }
    // TTL covers the remaining window plus a buffer.
    const windowEnd = (Math.floor(now / RATE_LIMIT_WINDOW_SECONDS) + 1) * RATE_LIMIT_WINDOW_SECONDS;
    await kv.put(key, String(count + 1), { expirationTtl: windowEnd - now + 60 });
    return { allowed: true, remaining: RATE_LIMIT_PER_DAY - count - 1 };
  } catch {
    return { allowed: true, remaining: -1 }; // Keep the service available if KV fails
  }
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

function corsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get("Origin") || "";
  const allowedOrigin = origin === "https://sweettalk.pages.dev" ? origin : "https://sweettalk.pages.dev";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
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
      return new Response(JSON.stringify({
        error: "DeepSeek API key is not configured.",
        debug: "Set DEEPSEEK_API_KEY in Cloudflare Pages Environment variables and redeploy.",
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    }

    // ── Rate limit check ──
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
          ...corsHeaders(request),
        },
      });
    }

    const body = await request.json();

    // ── Payload size limits to prevent abuse ──
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 60) {
      return new Response(JSON.stringify({ error: "Invalid messages payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    }
    for (const m of messages) {
      if (typeof m?.content !== "string" || m.content.length > 4000) {
        return new Response(JSON.stringify({ error: "Message too long." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        });
      }
    }

    // Always append the safety policy server-side so clients cannot override it.
    const systemIndex = messages.findIndex((m: any) => m.role === "system");
    const safeMessages = messages.map((m: any, index: number) =>
      index === systemIndex
        ? { ...m, content: `${m.content}\n${SAFETY_POLICY}` }
        : m
    );
    if (systemIndex === -1) {
      safeMessages.unshift({ role: "system", content: SAFETY_POLICY });
    }

    // Call the DeepSeek API
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: typeof body.model === "string" ? body.model : "deepseek-chat",
        messages: safeMessages,
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
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": String(rl.remaining),
        ...corsHeaders(request),
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(request) },
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://sweettalk.pages.dev",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
};
