
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

declare const Deno: any;

const apiKey = Deno.env.get('GEMINI_API_KEY') || '';

const pickModels = (primary: string | undefined, fallbacks: string[]) => {
  const list = [] as string[];
  const p = String(primary || '').trim();
  if (p) list.push(p);
  for (const m of fallbacks) {
    if (!list.includes(m)) list.push(m);
  }
  return list;
};

const DEFAULT_MODEL_FALLBACKS = [
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite-preview",
];

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:3002",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3002",
  "https://moliehgi-lm.vercel.app",
]);

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = allowedOrigins.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

const geminiGenerateContent = async (
  prompt: string,
  opts?: { useSearch?: boolean; history?: string[]; sources?: Array<{ title?: string; content?: string }> },
) => {
  const primaryModel = Deno.env.get("GEMINI_MODEL") || "";
  const models = pickModels(primaryModel, DEFAULT_MODEL_FALLBACKS);

  const useSearch = !!opts?.useSearch;
  const history = Array.isArray(opts?.history) ? opts?.history : [];
  const sources = Array.isArray(opts?.sources) ? opts?.sources : [];

  const parts: any[] = [];
  if (sources.length > 0) {
    parts.push({
      text:
        "FUENTES (resumen):\n" +
        sources
          .map((s) => `- ${String(s?.title || "Fuente")}: ${String(s?.content || "").slice(0, 2000)}`)
          .join("\n"),
    });
  }

  if (history.length > 0) {
    parts.push({ text: `HISTORIAL RECIENTE:\n${history.slice(-8).join("\n")}` });
  }

  parts.push({ text: prompt });

  let lastErr: Error | null = null;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        // Enable Google Search grounding when requested.
        // Note: Tool availability depends on the API key/project configuration.
        ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Gemini REST error ${res.status}: ${text}`);
      lastErr = err;
      // Model not found / not supported: try next
      if (res.status === 404) continue;
      throw err;
    }

    const json = await res.json();
    const text =
      json?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text)
        .filter(Boolean)
        .join("") ||
      "";
    return { text, groundingMetadata: json?.candidates?.[0]?.groundingMetadata };
  }

  throw lastErr || new Error("Gemini REST error: no supported model found");
};

const parseDataUrl = (dataUrl: string): { mimeType: string; data: string } => {
  const s = String(dataUrl || "");
  if (!s.includes("base64,")) {
    return { mimeType: "audio/webm", data: s };
  }
  const [meta, b64] = s.split("base64,");
  const m = meta.match(/data:(.*?);/);
  return { mimeType: m?.[1] || "audio/webm", data: b64 };
};

const geminiTranscribe = async (dataUrl: string): Promise<string> => {
  const { mimeType, data } = parseDataUrl(dataUrl);
  const primaryModel = Deno.env.get("GEMINI_TRANSCRIBE_MODEL") || Deno.env.get("GEMINI_MODEL") || "";
  const models = pickModels(primaryModel, DEFAULT_MODEL_FALLBACKS);

  let lastErr: Error | null = null;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data,
                },
              },
              {
                text: "Transcribe EXACTLY what is said in this audio. Output only the raw transcript in Spanish if applicable. Do not add punctuation unless clearly spoken.",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Gemini REST error ${res.status}: ${text}`);
      lastErr = err;
      if (res.status === 404) continue;
      throw err;
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("") || "";
    return text;
  }

  throw lastErr || new Error("Gemini REST error: no supported model found");
};

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  try {
    const { action, prompt, history, sources, audio, config } = await req.json();
    const corsHeaders = getCorsHeaders(req);

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing GEMINI_API_KEY in Edge Function secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    
    // Construct prompt (the model also receives sources/history as structured parts)
    const fullPrompt = String(prompt || "");

    if (action === 'generateContent') {
        const result = await geminiGenerateContent(fullPrompt, {
          useSearch: !!config?.useSearch,
          history: Array.isArray(history) ? history : [],
          sources: Array.isArray(sources) ? sources : [],
        });
        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (action === 'transcribe') {
         const text = await geminiTranscribe(String(audio || ""));
         return new Response(JSON.stringify({ text }), {
             headers: { ...corsHeaders, 'Content-Type': 'application/json' }
         });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });

  } catch (error: any) {
    const corsHeaders = getCorsHeaders(req);
    const message = error?.message || String(error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
