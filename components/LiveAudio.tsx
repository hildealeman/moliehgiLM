import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Mic, MicOff, X, Activity, Volume2, Save, FileText, CheckCircle, AlertOctagon } from 'lucide-react';
import { ModelType } from '../types';
import { getEffectiveClientApiKey } from '../src/services/geminiService';

interface LiveAudioProps {
  isOpen: boolean;
  onClose: () => void;
  systemContext: string;
  onSaveTranscript: (text: string) => void;
}

const LiveAudio: React.FC<LiveAudioProps> = ({ isOpen, onClose, systemContext, onSaveTranscript }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState<number[]>(new Array(5).fill(10));
  const [error, setError] = useState<string | null>(null);
  
  // UI State for history (debounced)
  const [transcriptionHistory, setTranscriptionHistory] = useState<{role: string, text: string}[]>([]);
  const [hasSaved, setHasSaved] = useState(false);
  
  const sessionRef = useRef<any>(null); 
  const sessionInstanceRef = useRef<any>(null);
  const canSendRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const isMutedRef = useRef(false);
  
  // Data Refs for high-frequency updates
  const historyRef = useRef<{role: string, text: string}[]>([]);
  const currentInputRef = useRef("");
  const currentOutputRef = useRef("");
  const uiUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Track connection start time to detect immediate failures (auth/referrer issues)
  const connectionStartTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      // Reset state on open
      historyRef.current = [];
      setTranscriptionHistory([]);
      currentInputRef.current = "";
      currentOutputRef.current = "";
      setHasSaved(false);
      setError(null);
      
      startSession();
    } else {
      stopSession();
    }
    return () => {
        stopSession();
        if (uiUpdateTimeoutRef.current) {
            clearTimeout(uiUpdateTimeoutRef.current);
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Fake volume visualizer
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      setVolume(prev => prev.map(() => Math.random() * 40 + 10));
    }, 100);
    return () => clearInterval(interval);
  }, [isConnected]);

  const stopSession = () => {
    canSendRef.current = false;
    sessionInstanceRef.current = null;

    if (sessionRef.current) {
      // Clean up session if needed
    }

    if (processorRef.current) {
      try {
        processorRef.current.onaudioprocess = null;
      } catch {}
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(t => t.stop());
      } catch {}
      streamRef.current = null;
    }
    
    if (inputContextRef.current && inputContextRef.current.state !== 'closed') {
      try {
        inputContextRef.current.close();
      } catch (e) {
        console.warn("Error closing input context", e);
      }
    }
    
    if (outputContextRef.current && outputContextRef.current.state !== 'closed') {
      try {
        outputContextRef.current.close();
      } catch (e) {
         console.warn("Error closing output context", e);
      }
    }
    
    sourcesRef.current.forEach(src => {
      try {
        src.stop();
      } catch (e) {
        // Ignore errors if source is already stopped
      }
    });
    sourcesRef.current.clear();
    
    setIsConnected(false);
    setIsMuted(false);
  };

  const startSession = async () => {
    try {
      // Ensure previous session is stopped cleanly
      stopSession();
      
      connectionStartTimeRef.current = Date.now();

      // Check for valid key via service
      const apiKey = getEffectiveClientApiKey();
      if (!apiKey) {
          throw new Error("Live requiere una API Key del cliente (no funciona vía proxy). Abre Configuración (⚙️) y guarda tu key.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      inputContextRef.current = inputCtx;
      outputContextRef.current = outputCtx;
      
      if (typeof window !== 'undefined' && !(window as any).isSecureContext) {
        throw new Error('El micrófono requiere HTTPS (secure context). Abre la app en https:// y vuelve a intentar.');
      }
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia no está disponible en este navegador. En iPhone, prueba Safari o habilita permisos de micrófono en iOS Settings.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const sessionPromise = ai.live.connect({
        model: ModelType.LIVE,
        callbacks: {
          onopen: () => {
            console.log("Live session opened");
            setIsConnected(true);
            setError(null);

            // Allow realtime sending only after onopen
            canSendRef.current = true;
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (isMutedRef.current) return;
              if (!canSendRef.current) return;
              const session = sessionInstanceRef.current;
              if (!session) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              try {
                session.sendRealtimeInput({ media: pcmBlob });
              } catch {
                // Socket closed or error
              }
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
            
            sourceNodeRef.current = source;
            processorRef.current = scriptProcessor;
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Audio
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const audioCtx = outputContextRef.current;
              // Check if context is valid and running before using it
              if (!audioCtx || audioCtx.state === 'closed') return;

              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
              
              const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                audioCtx,
                24000,
                1
              );
              
              const source = audioCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioCtx.destination);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Handle Transcription Buffering
            if (msg.serverContent?.inputTranscription) {
                currentInputRef.current += msg.serverContent.inputTranscription.text;
            }
            if (msg.serverContent?.outputTranscription) {
                currentOutputRef.current += msg.serverContent.outputTranscription.text;
            }

            // Commit to History on Turn Complete
            if (msg.serverContent?.turnComplete) {
                const userInput = currentInputRef.current.trim();
                const modelOutput = currentOutputRef.current.trim();

                if (userInput || modelOutput) {
                     if (userInput) historyRef.current.push({ role: 'user', text: userInput });
                     if (modelOutput) historyRef.current.push({ role: 'model', text: modelOutput });
                     
                     // Debounce UI update to avoid re-rendering too often during rapid exchanges
                     if (!uiUpdateTimeoutRef.current) {
                         uiUpdateTimeoutRef.current = setTimeout(() => {
                             setTranscriptionHistory([...historyRef.current]);
                             uiUpdateTimeoutRef.current = null;
                         }, 500);
                     }
                }
                
                currentInputRef.current = "";
                currentOutputRef.current = "";
            }

            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(src => {
                  try { src.stop(); } catch(e){}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            console.log("Live session closed");
            setIsConnected(false);
            canSendRef.current = false;
            sessionInstanceRef.current = null;
            
            // If session closes very quickly (< 2 seconds), it's likely a 403 or 400 error during handshake
            // The WebSocket close code isn't always exposed by the SDK, so we infer from timing.
            const sessionDuration = Date.now() - connectionStartTimeRef.current;
            if (sessionDuration < 2000) {
                setError("Conexión rechazada (API Key inválida o 403 Forbidden). Revisa la configuración.");
            }
          },
          onerror: (e) => {
            console.error("Live session error", e);
            setIsConnected(false);
            canSendRef.current = false;
            sessionInstanceRef.current = null;
            setError("Error de conexión. Verifica tu API Key y restricciones.");
          }
        },
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {}, 
            outputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            systemInstruction: `Eres MolieLM, un asistente de audio HGI. Contexto:\n${systemContext}\n\nResponde en español, sé directo, técnico pero humano.`,
        }
      });
      
      sessionRef.current = sessionPromise;

      // Store the resolved session instance (if connect resolves)
      sessionPromise
        .then((s: any) => {
          sessionInstanceRef.current = s;
        })
        .catch(() => {
          // connect failed; onerror/onclose will handle UI state
          sessionInstanceRef.current = null;
          canSendRef.current = false;
        });

    } catch (err: any) {
      console.error("Failed to start live session", err);
      const name = String(err?.name || "");
      const msg = String(err?.message || "Failed to initialize");

      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError(
          [
            'Permiso de micrófono bloqueado.',
            'En iPhone (Chrome):',
            '1) iOS Settings → Chrome → Microphone → Allow',
            '2) iOS Settings → Privacy & Security → Microphone → Chrome ON',
            '3) Recarga la página e intenta de nuevo.',
          ].join('\n'),
        );
        return;
      }

      setError(msg);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleSave = () => {
      // Flush any remaining buffers
      let finalTranscript = historyRef.current.map(t => `${t.role === 'user' ? 'USUARIO' : 'MOLIE_LM'}: ${t.text}`).join('\n\n');
      
      const pendingInput = currentInputRef.current.trim();
      const pendingOutput = currentOutputRef.current.trim();
      
      if (pendingInput) finalTranscript += `\n\nUSUARIO: ${pendingInput}`;
      if (pendingOutput) finalTranscript += `\n\nMOLIE_LM: ${pendingOutput}`;

      if (finalTranscript) {
          onSaveTranscript(finalTranscript);
          setHasSaved(true);
      }
  };

  const createBlob = (data: Float32Array) => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);
    return {
      data: b64,
      mimeType: 'audio/pcm;rate=16000'
    };
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    
    for (let c = 0; c < numChannels; c++) {
      const chData = buffer.getChannelData(c);
      for (let i = 0; i < frameCount; i++) {
        chData[i] = dataInt16[i * numChannels + c] / 32768.0;
      }
    }
    return buffer;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center font-mono">
      <div className="bg-neutral-900 border border-neutral-800 p-8 w-full max-w-md relative">
        <div className={`absolute top-0 left-0 w-full h-0.5 ${error ? 'bg-red-500' : 'bg-gradient-to-r from-orange-500 to-red-500'}`} />
        
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors">
          <X size={20} />
        </button>

        <div className="flex flex-col items-center justify-center py-6 space-y-8">
          <div className="relative">
            <div className={`w-32 h-32 rounded-full border flex items-center justify-center transition-all duration-500 ${error ? 'border-red-500 bg-red-900/20' : isConnected ? 'bg-neutral-800 border-neutral-800 shadow-[0_0_30px_rgba(249,115,22,0.2)]' : 'bg-neutral-900 border-neutral-800'}`}>
               {error ? (
                   <AlertOctagon className="text-red-500 animate-pulse" size={32} />
               ) : isConnected ? (
                 <div className="flex gap-1.5 items-end h-10">
                   {volume.map((h, i) => (
                     <div key={i} className="w-1.5 bg-orange-500 transition-all duration-100" style={{ height: `${h}px` }} />
                   ))}
                 </div>
               ) : (
                 <Activity className="text-neutral-600 animate-pulse" size={32} />
               )}
            </div>
            {isConnected && !error && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-green-500 text-black text-[9px] px-2 py-0.5 font-bold uppercase tracking-widest">
                Live_Feed
              </div>
            )}
            {error && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] px-2 py-0.5 font-bold uppercase tracking-widest whitespace-nowrap">
                    Connection_Failed
                </div>
            )}
          </div>

          <div className="text-center">
            <h3 className="text-lg font-bold text-white uppercase tracking-widest">Voice Interface</h3>
            <p className={`text-xs mt-2 uppercase tracking-wide ${error ? 'text-red-400' : 'text-neutral-500'}`}>
                {error 
                    ? error 
                    : isConnected 
                        ? 'Encryption: Active // Stream: Stable' 
                        : 'Initializing Handshake...'}
            </p>
            {/* Show live updating count derived from ref-backed state */}
            {transcriptionHistory.length > 0 && !error && (
                <p className="text-neutral-600 text-[10px] mt-4 font-mono">
                   {transcriptionHistory.length} turns recorded
                </p>
            )}
          </div>

          {!error ? (
              <div className="flex gap-4">
                 <button 
                   onClick={toggleMute}
                   className={`p-4 border transition-colors rounded-full ${isMuted ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-neutral-700 text-neutral-400 hover:text-white hover:border-white'}`}
                 >
                   {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                 </button>
                 
                 <button
                   onClick={handleSave}
                   disabled={transcriptionHistory.length === 0}
                   className={`p-4 border transition-all rounded-full flex items-center justify-center gap-2 ${hasSaved ? 'border-green-500 text-green-500 bg-green-500/10' : 'border-neutral-700 text-neutral-400 hover:text-white hover:border-white'}`}
                   title="Save Transcription to Project"
                 >
                     {hasSaved ? <CheckCircle size={24} /> : <Save size={24} />}
                 </button>
              </div>
          ) : (
              <button 
                  onClick={onClose}
                  className="bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-2 text-xs uppercase font-bold tracking-wider border border-neutral-700"
              >
                  Close & Retry
              </button>
          )}
          
          {hasSaved && (
              <p className="text-green-500 text-[10px] uppercase tracking-widest animate-fade-in-up">
                  Transcript saved as Source
              </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveAudio;