import { GoogleGenAI, GenerateContentResponse, Modality, Type } from "@google/genai";
import { ModelType, ImageGenOptions, Source } from "../../types";
import { supabase } from "../lib/supabase/client";

// Helper to safely access env vars
const getEnvVar = (key: string): string => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      return import.meta.env[key] || '';
    }
  } catch (e) {
    // Silent fail
  }
  return '';
};

const AI_PROVIDER = getEnvVar('VITE_AI_PROVIDER') || 'gemini_client';

// Determine the effective API Key
export const getSystemApiKey = () => {
    let envKey = '';
    try {
        // @ts-ignore
        if (typeof process !== 'undefined' && process.env) {
            // @ts-ignore
            envKey = process.env.API_KEY || '';
        } else {
            const viteKey = getEnvVar('VITE_API_KEY');
            if (viteKey) envKey = viteKey;
        }
    } catch (e) {}
    
    // Detect invalid placeholder keys injected during build/deploy
    if (!envKey || envKey === 'UNUSED_PLACEHOLDER_FOR_API_KEY' || envKey.includes('PLACEHOLDER') || envKey === 'YOUR_ACTUAL_API_KEY_HERE') {
        return '';
    }
    return envKey;
};

export const getStoredApiKey = () => localStorage.getItem('molielm_api_key') || '';
export const setStoredApiKey = (key: string) => localStorage.setItem('molielm_api_key', key);

export const getEffectiveApiKey = () => {
    // If using proxy, we don't need a client-side key
    if (AI_PROVIDER === 'gemini_proxy') return 'PROXY_MODE';
    const sysKey = getSystemApiKey();
    if (sysKey) return sysKey;
    return getStoredApiKey();
};

export const getEffectiveClientApiKey = () => {
    // Some features (Gemini Live websocket) cannot be proxied and require a real client key.
    const sysKey = getSystemApiKey();
    if (sysKey) return sysKey;
    return getStoredApiKey();
};

const getClient = () => {
    const apiKey = getEffectiveApiKey();
    if (apiKey === 'PROXY_MODE') {
        // Client returns null in proxy mode, methods should handle this or use proxy path
        return null; 
    }
    if (!apiKey) {
        throw new Error("MISSING_API_KEY");
    }
    return new GoogleGenAI({ apiKey });
};

// Helper to parse errors
const handleGeminiError = (error: any): never => {
    const msg = error?.message || error?.toString() || '';
    console.error("Gemini API Error:", msg);
    
    if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('REFERRER_BLOCKED')) {
        throw new Error(`⛔ **ACCESO DENEGADO (403)**\n\nGoogle ha bloqueado esta solicitud porque tu API Key tiene restricciones de dominio activas.\n\n**SOLUCIÓN:**\n1. Ve a [Google AI Studio > API Keys](https://aistudio.google.com/app/apikey)\n2. Haz clic en tu clave.\n3. En **"Client restrictions"**, selecciona **"None"**.\n4. Si el problema persiste, usa el botón **Configuración (⚙️)** en la barra lateral para ingresar una nueva clave.`);
    }
    
    if (msg.includes('400') || msg.includes('API key not valid') || msg.includes('INVALID_ARGUMENT')) {
        throw new Error("⚠️ **API KEY INVÁLIDA (400)**\n\nLa clave actual no es válida.\n\nUsa el botón **Configuración (⚙️)** en la parte inferior de la barra lateral para ingresar una clave válida.");
    }

    if (msg === "MISSING_API_KEY") {
        throw new Error("⚠️ **FALTA API KEY**\n\nNo se detectó ninguna clave.\n\nPor favor configura tu API Key usando el menú de **Configuración (⚙️)** en la barra lateral.");
    }

    throw error;
};

// --- HELPER FOR BINARY TEXT EXTRACTION ---
export const extractTextFromMultimodal = async (source: Source): Promise<string> => {
    try {
        const ai = getClient();
        if (!ai) return ""; // Skip if proxy mode (proxy doesn't support binary extraction yet)

        // Use a fast model for extraction
        const model = 'gemini-2.5-flash-lite-preview'; 

        const cleanData = source.content.includes('base64,') ? source.content.split('base64,')[1] : source.content;
        
        const response = await ai.models.generateContent({
            model,
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: source.mimeType || 'application/pdf',
                            data: cleanData
                        }
                    },
                    { text: "Extract all legible text from this document/image. Output ONLY the raw text content. Do not add markdown formatting or commentary." }
                ]
            }
        });
        return response.text || "";
    } catch (e) {
        console.warn("Extraction failed (likely non-extractable content or proxy mode)", e);
        return "";
    }
};

export const generateTextResponse = async (
  prompt: string,
  history: string[], 
  sources: Source[],
  useThinking: boolean = false,
  useSearch: boolean = false
): Promise<{ text: string, groundingMetadata?: any }> => {
  try {
      if (AI_PROVIDER === 'gemini_proxy') {
          if (!supabase) throw new Error("Supabase not configured for Proxy Mode");
          
          const { data, error } = await supabase.functions.invoke('gemini-proxy', {
              body: {
                  action: 'generateContent',
                  prompt,
                  history,
                  // Send simplified source context to reduce payload size if using RAG
                  sources: sources.map(s => {
                    const isBinary = s.type === 'image' || s.mimeType === 'application/pdf' || String(s.mimeType || '').startsWith('image/');
                    return {
                      title: s.title,
                      content: isBinary ? s.content : (s.extractedText || s.content),
                      type: s.type,
                      mimeType: s.mimeType,
                    };
                  }),
                  config: { useThinking, useSearch }
              }
          });

          if (error) throw new Error(error.message);
          return data;

      } else {
          // EXISTING CLIENT-SIDE LOGIC
          const ai = getClient();
          if (!ai) throw new Error("Client initialization failed");
          
          // System Instruction
          const systemInstruction = `Eres MolieLM, un asistente de investigación de inteligencia fundamentada en humanos (HGI). 
          Tu objetivo es conectar ideas, refinar conceptos y ofrecer soluciones basadas en el contexto proporcionado.
          
          Si el usuario ha subido documentos (PDFs, Imágenes, Texto), tu prioridad absoluta es basar tus respuestas en esa información.
          Si te pido analizar un archivo SQL o CSV, actúa como un analista de datos experto.
          
          MODO DEEP SEARCH / HYPERLINK:
          Si la herramienta de búsqueda (Google Search) está activa:
          1. Investiga profundamente el tema solicitado.
          2. Proporciona datos actualizados y relevantes.
          3. Tus respuestas deben ser ricas en información.
          
          MODO RAG ACTIVADO:
          Si la pregunta requiere evidencia específica de los archivos locales, estructura tu respuesta así:
          |||EVIDENCIA|||
          (Cita textual o descripción de la parte del archivo relevante)
          |||RAZONAMIENTO|||
          (Tu proceso lógico paso a paso)
          |||RESPUESTA|||
          (La respuesta final al usuario)

          Responde siempre en español. Sé riguroso, ético y útil.`;

          const model = ModelType.PRO;

          const config: any = {
            systemInstruction,
          };

          if (useThinking) {
            config.thinkingConfig = { thinkingBudget: 32768 };
          }
          
          if (useSearch) {
            config.tools = [{ googleSearch: {} }];
          }

          // Construct Content Parts
          const parts: any[] = [];

          // 1. Add Sources
          sources.forEach(src => {
            if (src.type === 'image' || src.mimeType === 'application/pdf') {
              // Binary inputs (Images, PDFs)
              // Strip base64 prefix if present
              const cleanData = src.content.includes('base64,') ? src.content.split('base64,')[1] : src.content;
              parts.push({
                inlineData: {
                  mimeType: src.mimeType || 'image/png', // Default to png if missing
                  data: cleanData
                }
              });
              parts.push({ text: `[Archivo Adjunto: ${src.title}]` });
            } else {
              // Text inputs
              parts.push({
                text: `CONTENIDO DE FUENTE [${src.title}]:\n${src.content}\n---FIN FUENTE---\n`
              });
            }
          });

          // 2. Add History
          if (history.length > 0) {
             parts.push({ text: `\nHISTORIAL DE CHAT RECIENTE:\n${history.join('\n')}\n` });
          }

          // 3. Add Current Prompt
          parts.push({ text: prompt });

          const response = await ai.models.generateContent({
            model,
            contents: { parts },
            config
          });

          return {
            text: response.text || "No se pudo generar respuesta.",
            groundingMetadata: response.candidates?.[0]?.groundingMetadata
          };
      }
  } catch (error) {
     return handleGeminiError(error);
  }
};

export const generateSuggestions = async (sources: Source[], history: string[]): Promise<string[]> => {
  try {
      const ai = getClient();
      if (!ai) return ["Resumir documentos", "Extraer puntos clave", "Analizar tono"]; // Fallback for proxy

      const parts: any[] = [];
      
      sources.forEach(src => {
          if (src.type === 'text') {
               parts.push({ text: `Extracto Fuente [${src.title}]: ${src.content.substring(0, 1000)}...` });
          } else {
               const content = src.extractedText ? src.extractedText.substring(0, 1000) : `Archivo cargado: ${src.title}`;
               parts.push({ text: content });
          }
      });

      if (history.length > 0) {
          parts.push({ text: `Últimos mensajes: ${history.slice(-3).join('\n')}` });
      }

      parts.push({ text: "Genera 3 preguntas o comandos muy breves (máximo 10 palabras) que el usuario podría preguntar a continuación. Responde en Español." });

      const response = await ai.models.generateContent({
          model: ModelType.FLASH,
          contents: { parts },
          config: {
              responseMimeType: "application/json",
              responseSchema: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
              }
          }
      });
      
      const json = JSON.parse(response.text || "[]");
      return Array.isArray(json) ? json.slice(0, 3) : [];
  } catch (error) {
      console.warn("Suggestion generation failed. Returning defaults.", error);
      return ["Resumir documentos", "Extraer puntos clave", "Analizar tono"];
  }
};

export const generateImage = async (prompt: string, options: ImageGenOptions): Promise<string> => {
    try {
        let ai = getClient();
        if (!ai) {
            const clientKey = getEffectiveClientApiKey();
            if (!clientKey) {
                throw new Error("Generación de imagen requiere una API Key del cliente. Abre Configuración (⚙️) y guarda tu key.");
            }
            ai = new GoogleGenAI({ apiKey: clientKey });
        }

        const usePro = options.size === '2K' || options.size === '4K';
        const model = usePro ? ModelType.IMAGE : 'gemini-2.5-flash-image';
        
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [{ text: prompt }] },
            config: {
                imageConfig: {
                    aspectRatio: options.aspectRatio,
                    ...(usePro ? { imageSize: options.size } : {})
                }
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                const base64EncodeString = part.inlineData.data;
                return `data:${part.inlineData.mimeType};base64,${base64EncodeString}`;
            }
        }
        throw new Error("No se pudo generar la imagen.");
    } catch (error) {
        return handleGeminiError(error);
    }
};

export const analyzeImage = async (base64Image: string, prompt: string): Promise<string> => {
    try {
        if (AI_PROVIDER === 'gemini_proxy') {
            if (!supabase) throw new Error("Supabase missing");
            const { data, error } = await supabase.functions.invoke('gemini-proxy', {
                body: {
                    action: 'analyzeImage',
                    image: base64Image,
                    prompt,
                }
            });
            if (error) throw error;
            return data.text || "No se pudo analizar la imagen.";
        }

        const ai = getClient();
        if (!ai) throw new Error("Client initialization failed");

        const cleanData = base64Image.includes('base64,') ? base64Image.split('base64,')[1] : base64Image;
        const mimeType = base64Image.includes('data:image/jpeg') ? 'image/jpeg' : 'image/png';
        
        const response = await ai.models.generateContent({
            model: ModelType.FLASH,
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType,
                            data: cleanData
                        }
                    },
                    { text: prompt }
                ]
            }
        });
        return response.text || "No se pudo analizar la imagen.";
    } catch (error) {
        return handleGeminiError(error);
    }
};

export const transcribeAudio = async (base64Audio: string): Promise<string> => {
    try {
        if (AI_PROVIDER === 'gemini_proxy') {
            if (!supabase) throw new Error("Supabase missing");
            const { data, error } = await supabase.functions.invoke('gemini-proxy', {
                body: {
                    action: 'transcribe',
                    audio: base64Audio
                }
            });
            if (error) throw error;
            return data.text;
        }

        const ai = getClient();
        if (!ai) throw new Error("Client initialization failed");
        
        let mimeType = 'audio/webm';
        let cleanData = base64Audio;
        
        if (base64Audio.includes('base64,')) {
            const parts = base64Audio.split('base64,');
            cleanData = parts[1];
            const meta = parts[0];
            const matches = meta.match(/data:(.*?);/);
            if (matches && matches[1]) {
                mimeType = matches[1];
            }
        }

        const response = await ai.models.generateContent({
            model: ModelType.FLASH,
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType,
                            data: cleanData
                        }
                    },
                    { text: "Transcribe exactly what is said in this audio." }
                ]
            }
        });
        return response.text || "";
    } catch (error) {
        return handleGeminiError(error);
    }
};

export const textToSpeech = async (text: string): Promise<ArrayBuffer> => {
    try {
        let ai = getClient();
        if (!ai) {
            const clientKey = getEffectiveClientApiKey();
            if (!clientKey) {
                throw new Error("TTS requiere una API Key del cliente. Abre Configuración (⚙️) y guarda tu key.");
            }
            ai = new GoogleGenAI({ apiKey: clientKey });
        }

        const safeText = text.length > 4000 ? text.substring(0, 4000) + "... (truncated)" : text;
        const response = await ai.models.generateContent({
            model: ModelType.TTS,
            contents: { parts: [{ text: safeText }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }
                    }
                }
            }
        });
        
        const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64) throw new Error("No se generó audio.");
        
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    } catch (error) {
        handleGeminiError(error);
        return new ArrayBuffer(0);
    }
};

export const generatePodcastAudio = async (script: string): Promise<string> => {
    try {
        let ai = getClient();
        if (!ai) {
            const clientKey = getEffectiveClientApiKey();
            if (!clientKey) {
                throw new Error("Podcast requiere una API Key del cliente. Abre Configuración (⚙️) y guarda tu key.");
            }
            ai = new GoogleGenAI({ apiKey: clientKey });
        }

        const safeDialogue = script.length > 4000 ? script.substring(0, 4000) : script;
        const prompt = `TTS the following conversation between Kore and Puck:\n\n${safeDialogue}`;
        
        const response = await ai.models.generateContent({
            model: ModelType.TTS,
            contents: { parts: [{ text: prompt }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    multiSpeakerVoiceConfig: {
                        speakerVoiceConfigs: [
                            {
                                speaker: 'Kore',
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: 'Kore' }
                                }
                            },
                            {
                                speaker: 'Puck',
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: 'Puck' }
                                }
                            }
                        ]
                    }
                }
            }
        });

        const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64) throw new Error("No se generó el podcast.");
        
        return base64;
    } catch (error) {
        return handleGeminiError(error);
    }
};