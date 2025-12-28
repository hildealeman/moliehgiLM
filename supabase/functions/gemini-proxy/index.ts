
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "https://esm.sh/@google/genai@0.1.0";

declare const Deno: any;

const apiKey = Deno.env.get('GEMINI_API_KEY')!;

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  try {
    const { action, prompt, history, sources, audio } = await req.json();
    const ai = new GoogleGenAI({ apiKey });
    
    // Construct Prompt
    let fullPrompt = `System: Use the following sources to answer.\n`;
    if (sources) {
        sources.forEach((s: any) => {
            fullPrompt += `Source [${s.title}]: ${s.content.substring(0, 2000)}\n`;
        });
    }
    fullPrompt += `\nUser: ${prompt}`;

    if (action === 'generateContent') {
        // Mock implementation of calling Gemini
        // In real deployment, use proper ai.models.generateContent
        const response = await ai.models.generateContent({
             model: 'gemini-3-flash-preview',
             contents: { parts: [{ text: fullPrompt }] }
        });
        
        return new Response(JSON.stringify({ text: response.text }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    if (action === 'transcribe') {
         // Minimal mock for transcription via proxy
         // In production, this would use a dedicated endpoint or model
         return new Response(JSON.stringify({ text: "Transcription from Proxy (Mock)" }), {
             headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
         });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
