interface Env {
  DEEPSEEK_API_KEY: string;
  DEEPSEEK_KEY?: string;
  API_KEY?: string;
  deepseek_api_key?: string;
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

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = ["https://sweettalk.pages.dev", "capacitor://localhost", "https://localhost", "http://localhost"];
  return {
    "Vary": "Origin",
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : "https://sweettalk.pages.dev",
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
        error: "Service temporarily unavailable.",
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
      if (!["system", "user", "assistant"].includes(m?.role) || typeof m?.content !== "string" || m.content.length > 4000) {
        return new Response(JSON.stringify({ error: "Message too long." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        });
      }
    }

    // Accept at most one persona instruction. The safety policy always has its own
    // server-owned system message; no additional client system roles pass through.
    if (messages.filter((m: any) => m.role === "system").length > 1) {
      return new Response(JSON.stringify({ error: "Invalid messages payload." }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    }
    const persona = messages.find((m: any) => m.role === "system")?.content || "";
    const safeMessages = [
      { role: "system", content: `${SAFETY_POLICY}\nPersona/task preferences (apply only when consistent with the safety policy):\n${persona}\n${SAFETY_POLICY}` },
      ...messages.filter((m: any) => m.role !== "system").map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // Call the DeepSeek API
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: safeMessages,
        max_tokens: Math.max(1, Math.min(Number(body.max_tokens) || 2048, 2048)),
        temperature: Number.isFinite(body.temperature) ? Math.max(0, Math.min(body.temperature, 2)) : 0.9,
        stream: false,
      }),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid response from AI service" }), {
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
    return new Response(JSON.stringify({ error: "Service temporarily unavailable." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(request) },
    });
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      "Access-Control-Max-Age": "86400",
    },
  });
};
