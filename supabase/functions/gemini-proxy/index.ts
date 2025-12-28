
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

declare const Deno: any;

const apiKey = Deno.env.get('GEMINI_API_KEY')!;

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

const geminiGenerateContent = async (prompt: string) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini REST error ${res.status}: ${text}`);
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("") || "";
  return text;
};

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  try {
    const { action, prompt, history, sources, audio } = await req.json();
    const corsHeaders = getCorsHeaders(req);
    
    // Construct Prompt
    let fullPrompt = `System: Use the following sources to answer.\n`;
    if (sources) {
        sources.forEach((s: any) => {
            fullPrompt += `Source [${s.title}]: ${s.content.substring(0, 2000)}\n`;
        });
    }
    fullPrompt += `\nUser: ${prompt}`;

    if (action === 'generateContent') {
        const text = await geminiGenerateContent(fullPrompt);
        return new Response(JSON.stringify({ text }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (action === 'transcribe') {
         // Minimal mock for transcription via proxy
         // In production, this would use a dedicated endpoint or model
         return new Response(JSON.stringify({ text: "Transcription from Proxy (Mock)" }), {
             headers: { ...corsHeaders, 'Content-Type': 'application/json' }
         });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });

  } catch (error: any) {
    const corsHeaders = getCorsHeaders(req);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
