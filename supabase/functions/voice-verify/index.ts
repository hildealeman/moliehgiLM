import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

type Json = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeTranscript = (t: string): string => {
  return (t || "")
    .toLowerCase()
    .trim()
    .replace(/[\r\n]+/g, " ")
    .replace(/[.,;:!?¡¿"“”'`]/g, "")
    .replace(/\s+/g, " ");
};

const sha256Hex = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const VOICE_HASH_SALT = Deno.env.get("VOICE_HASH_SALT") ?? "";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: "Missing SUPABASE_URL/SUPABASE_ANON_KEY" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
      auth: {
        persistSession: false,
      },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ verified: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as Json;
    const transcriptRaw = String(body.transcript ?? "");
    const transcriptNorm = normalizeTranscript(transcriptRaw);

    if (!transcriptNorm) {
      return new Response(JSON.stringify({ verified: false, error: "Empty transcript" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcriptHash = await sha256Hex(`${VOICE_HASH_SALT}:${transcriptNorm}`);

    const { data: keys, error: keysErr } = await supabase
      .from("molielm_voice_keys")
      .select("phrase_hash")
      .eq("user_id", userId)
      .eq("active", true);

    if (keysErr) {
      await supabase.from("molielm_edge_logs").insert({
        user_id: userId,
        fn: "voice-verify",
        action: "verify",
        ok: false,
        request_json: { transcript_hash: transcriptHash },
        error: keysErr.message,
      });

      return new Response(JSON.stringify({ verified: false, error: "DB error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verified = Array.isArray(keys) && keys.some((k) => k.phrase_hash === transcriptHash);

    let username = "User";
    const { data: profile } = await supabase
      .from("molielm_profiles")
      .select("name")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.name) username = profile.name;

    await supabase.from("molielm_edge_logs").insert({
      user_id: userId,
      fn: "voice-verify",
      action: "verify",
      ok: verified,
      request_json: {
        transcript_hash: transcriptHash,
        transcript_preview: transcriptNorm.slice(0, 48),
      },
      response_json: { verified },
    });

    return new Response(JSON.stringify({ verified, username }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ verified: false, error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
