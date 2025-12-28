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

  if (!VOICE_HASH_SALT) {
    return new Response(JSON.stringify({ error: "Missing VOICE_HASH_SALT" }), {
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
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as Json;
    const transcriptRaw = String(body.transcript ?? "");
    const phraseHint = body.phrase_hint ? String(body.phrase_hint) : null;

    const transcriptNorm = normalizeTranscript(transcriptRaw);
    if (!transcriptNorm) {
      return new Response(JSON.stringify({ ok: false, error: "Empty transcript" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcriptHash = await sha256Hex(`${VOICE_HASH_SALT}:${transcriptNorm}`);

    // Single-active key strategy: deactivate existing, then insert new
    const { error: deactivateErr } = await supabase
      .from("molielm_voice_keys")
      .update({ active: false })
      .eq("user_id", userId)
      .eq("active", true);

    if (deactivateErr) {
      await supabase.from("molielm_edge_logs").insert({
        user_id: userId,
        fn: "voice-enroll",
        action: "deactivate_previous",
        ok: false,
        request_json: { transcript_hash: transcriptHash },
        error: deactivateErr.message,
      });

      return new Response(JSON.stringify({ ok: false, error: "DB error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("molielm_voice_keys")
      .insert({
        user_id: userId,
        phrase_hash: transcriptHash,
        phrase_hint: phraseHint,
        active: true,
      })
      .select("id")
      .single();

    if (insertErr) {
      await supabase.from("molielm_edge_logs").insert({
        user_id: userId,
        fn: "voice-enroll",
        action: "insert",
        ok: false,
        request_json: { transcript_hash: transcriptHash },
        error: insertErr.message,
      });

      return new Response(JSON.stringify({ ok: false, error: "DB error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("molielm_edge_logs").insert({
      user_id: userId,
      fn: "voice-enroll",
      action: "insert",
      ok: true,
      request_json: {
        transcript_hash: transcriptHash,
        transcript_preview: transcriptNorm.slice(0, 48),
      },
      response_json: { voice_key_id: inserted?.id },
    });

    return new Response(JSON.stringify({ ok: true, voice_key_id: inserted?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
