
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Lock, ShieldCheck, Activity, Loader2, AlertTriangle, UserPlus, LogIn, ChevronRight, Settings } from 'lucide-react';
import { transcribeAudio } from '../src/services/geminiService';
import { storageService } from '../src/services/storageService';
import { supabase } from '../src/lib/supabase/client';

interface LoginScreenProps {
  stage?: 'supabase' | 'voice' | 'legacy';
  onAuthed?: () => void;
  onVoiceVerified?: () => void;
  onOpenSettings: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ stage = 'legacy', onAuthed, onVoiceVerified, onOpenSettings }) => {
  // Modes: 'login' | 'signup'
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  
  // Login State
  const [loginStep, setLoginStep] = useState<'creds' | 'voice'>('creds');
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Voice confirmation state (shared)
  const [pendingTranscript, setPendingTranscript] = useState<string>("");
  const [pendingAudio, setPendingAudio] = useState<string>("");
  const [pendingMeta, setPendingMeta] = useState<{ durationMs?: number; sampleRate?: number; rms?: number } | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Signup State
  const [signupStep, setSignupStep] = useState(1); // 1: Creds, 2: Calibration, 3: Voice
  const [newUsername, setNewUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [voicePhrase, setVoicePhrase] = useState("");

  // Global UI State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Audio Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
      // Reset state on mode change
      setError(null);
      setIsRecording(false);
      setIsProcessing(false);
      setPendingTranscript("");
      setPendingAudio("");
      setPendingMeta(null);
      if (mode === 'login') {
          setLoginStep('creds');
          setLoginEmail("");
          setLoginPassword("");
      } else {
          setSignupStep(1);
          setNewUsername("");
          setSignupEmail("");
          setNewPassword("");
          setVoicePhrase("");
      }
  }, [mode]);

  useEffect(() => {
      // When App asks for a specific stage, default to login mode.
      setMode('login');
      if (stage === 'voice') setLoginStep('voice');
      else setLoginStep('creds');
      setPendingTranscript("");
      setPendingAudio("");
      setPendingMeta(null);
  }, [stage]);

  const requireSupabase = () => {
      if (!supabase) throw new Error("Supabase no configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
  };

  const handleSupabaseLogin = async () => {
      requireSupabase();
      if (!loginEmail || !loginPassword) {
          setError("Falta email o password");
          return;
      }
      setIsProcessing(true);
      setError(null);
      try {
          const { error } = await supabase!.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
          if (error) throw error;
          onAuthed?.();
          setLoginStep('voice');
          setPendingTranscript("");
          setPendingAudio("");
      } catch (e: any) {
          setError(e.message || "Error al iniciar sesión");
      } finally {
          setIsProcessing(false);
      }
  };

  const encodeWavPcm16 = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
      const buffer = new ArrayBuffer(44 + samples.length * 2);
      const view = new DataView(buffer);

      const writeString = (offset: number, str: string) => {
          for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      };

      // RIFF header
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + samples.length * 2, true);
      writeString(8, 'WAVE');

      // fmt chunk
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true); // PCM
      view.setUint16(20, 1, true); // audio format = PCM
      view.setUint16(22, 1, true); // channels = mono
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true); // byte rate
      view.setUint16(32, 2, true); // block align
      view.setUint16(34, 16, true); // bits per sample

      // data chunk
      writeString(36, 'data');
      view.setUint32(40, samples.length * 2, true);

      let offset = 44;
      for (let i = 0; i < samples.length; i++) {
          let s = samples[i];
          if (s > 1) s = 1;
          if (s < -1) s = -1;
          const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
          view.setInt16(offset, int16, true);
          offset += 2;
      }

      return buffer;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
  };

  const convertBlobToWavDataUrl = async (blob: Blob): Promise<string> => {
      const arrayBuffer = await blob.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const channelData = audioBuffer.getChannelData(0);
      const wav = encodeWavPcm16(channelData, audioBuffer.sampleRate);
      const b64 = arrayBufferToBase64(wav);
      try { await ctx.close(); } catch {}
      return `data:audio/wav;base64,${b64}`;
  };

  const convertBlobToWavDataUrlWithMeta = async (blob: Blob): Promise<{ dataUrl: string; durationMs?: number; sampleRate?: number; rms?: number }> => {
      const arrayBuffer = await blob.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const channelData = audioBuffer.getChannelData(0);

      let sumSq = 0;
      for (let i = 0; i < channelData.length; i++) {
          const s = channelData[i];
          sumSq += s * s;
      }
      const rms = channelData.length ? Math.sqrt(sumSq / channelData.length) : undefined;

      const wav = encodeWavPcm16(channelData, audioBuffer.sampleRate);
      const b64 = arrayBufferToBase64(wav);
      const dataUrl = `data:audio/wav;base64,${b64}`;
      const durationMs = Number.isFinite(audioBuffer.duration) ? Math.round(audioBuffer.duration * 1000) : undefined;
      const sampleRate = audioBuffer.sampleRate;
      try { await ctx.close(); } catch {}
      return { dataUrl, durationMs, sampleRate, rms };
  };

  const handleSupabaseSignup = async () => {
      requireSupabase();
      if (!signupEmail || !newPassword) {
          setError("Falta email o password");
          return;
      }
      setIsProcessing(true);
      setError(null);
      try {
          const { data, error } = await supabase!.auth.signUp({ email: signupEmail, password: newPassword });
          if (error) throw error;

          // If email confirmations are enabled, Supabase won't create a session immediately.
          if (!data?.session) {
              setError("Cuenta creada, pero falta confirmar el email. Revisa tu correo y luego haz Login.");
              return;
          }

          onAuthed?.();

          try {
              await storageService.saveSessionUser(newUsername || signupEmail);
          } catch (e: any) {
              const msg = e?.message || "Error al guardar perfil";
              const details = e?.details || e?.hint || e?.code || "";
              setError(details ? `${msg} (${details})` : msg);
              return;
          }

          setSignupStep(2);
          setPendingTranscript("");
          setPendingAudio("");
          setPendingMeta(null);
      } catch (e: any) {
          const msg = e?.message || "Error al registrar usuario";
          const details = e?.details || e?.hint || e?.code || "";
          setError(details ? `${msg} (${details})` : msg);
      } finally {
          setIsProcessing(false);
      }
  };

  const resetPendingVoice = () => {
      setPendingTranscript("");
      setPendingAudio("");
      setPendingMeta(null);
      setError(null);
      try {
          audioElRef.current?.pause();
          // Reset playback position
          if (audioElRef.current) audioElRef.current.currentTime = 0;
      } catch {}
  };

  const acceptPendingVoice = async () => {
      if (!pendingTranscript) {
          setError("No hay transcripción para confirmar");
          return;
      }

      setIsProcessing(true);
      setError(null);
      try {
          if (mode === 'login') {
              const identified = await storageService.verifyUserVoice(pendingTranscript);
              if (identified) {
                  onVoiceVerified?.();
              } else {
                  setError(`Identidad no verificada. Se escuchó: "${pendingTranscript}"`);
                  resetPendingVoice();
              }
              return;
          }

          // signup
          if (signupStep === 2) {
              // Mandatory VMV calibration: save a guided reading sample before allowing voice key enrollment.
              const promptText = "En un lugar de la Mancha, de cuyo nombre no quiero acordarme";
              await storageService.saveVoiceCalibration({
                  promptText,
                  transcript: pendingTranscript,
                  audioDataUrl: pendingAudio,
                  durationMs: pendingMeta?.durationMs,
                  sampleRate: pendingMeta?.sampleRate,
                  rms: pendingMeta?.rms,
                  locale: "es-MX",
              });
              resetPendingVoice();
              setSignupStep(3);
              return;
          }

          // Voice key enrollment (after calibration)
          setVoicePhrase(pendingTranscript);
          if (supabase) {
              const { error } = await supabase.functions.invoke('voice-enroll', {
                  body: { transcript: pendingTranscript, phrase_hint: newUsername || signupEmail }
              });
              if (error) throw new Error(error.message);
          }
          onVoiceVerified?.();
      } catch (e: any) {
          setError(e.message || "Error en autenticación");
      } finally {
          setIsProcessing(false);
      }
  };

  const startVisualizer = (stream: MediaStream) => {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);

      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const draw = () => {
          if (!canvasRef.current) return;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          analyzer.getByteFrequencyData(dataArray);

          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          const radius = 30;

          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
          ctx.strokeStyle = mode === 'signup' ? '#3b82f6' : '#f97316';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Draw bars radiating out
          for(let i = 0; i < bufferLength; i += 4) {
              const value = dataArray[i];
              const angle = (i / bufferLength) * 2 * Math.PI;
              const barHeight = (value / 255) * 40;
              
              const x1 = centerX + Math.cos(angle) * (radius + 5);
              const y1 = centerY + Math.sin(angle) * (radius + 5);
              const x2 = centerX + Math.cos(angle) * (radius + 5 + barHeight);
              const y2 = centerY + Math.sin(angle) * (radius + 5 + barHeight);

              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.strokeStyle = mode === 'signup' ? `rgba(59, 130, 246, ${value / 255})` : `rgba(249, 115, 22, ${value / 255})`;
              ctx.stroke();
          }

          animationRef.current = requestAnimationFrame(draw);
      };
      draw();
  };

  const startRecording = async () => {
    setError(null);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        startVisualizer(stream);

        // Prefer Opus in WebM when possible (best chance of decoding + WAV conversion)
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/webm';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            // Safari/iOS fallback
            mimeType = 'audio/mp4';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                throw new Error("Formato de audio no soportado en este navegador.");
            }
        }
        
        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (e) => { 
            if (e.data.size > 0) audioChunksRef.current.push(e.data); 
        };
        
        mediaRecorder.onstop = async () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
            
            // Wait a tick to ensure last chunk is pushed
            setTimeout(async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType }); 
                
                if (audioBlob.size < 100) {
                    setError("Grabación demasiado corta o vacía.");
                    return;
                }

                try {
                    // Gemini audio transcription supports WAV/MP3/AAC/OGG/FLAC; browsers usually record WEBM/MP4.
                    // Convert to WAV for production reliability.
                    const { dataUrl, durationMs, sampleRate, rms } = await convertBlobToWavDataUrlWithMeta(audioBlob);
                    setPendingMeta({ durationMs, sampleRate, rms });
                    await processAudio(dataUrl);
                } catch (e: any) {
                    console.error('WAV conversion failed', e);
                    setPendingMeta(null);
                    setError("No se pudo convertir el audio a WAV (necesario para transcripción). Intenta en Chrome/Edge o revisa permisos de micrófono.");
                    return;
                }
            }, 100);
            
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start(100); // Request chunks every 100ms
        setIsRecording(true);
    } catch (err: any) { 
        setError("Error de micrófono: " + err.message);
        console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
    }
  };

  const processAudio = async (base64Audio: string) => {
      setIsProcessing(true);
      try {
          if (!base64Audio || base64Audio.length < 500) {
              throw new Error("Datos de audio insuficientes.");
          }

          const transcription = await transcribeAudio(base64Audio);
          const cleanText = transcription.trim().replace(/[.,]/g, '');
          
          if (!cleanText) {
              throw new Error("No se detectó voz. Intenta de nuevo.");
          }

          // NEW FLOW: store pending transcript + audio for user confirmation
          setPendingTranscript(cleanText);
          setPendingAudio(base64Audio);
      } catch (e: any) {
          setError(e.message || "Error en autenticación");
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center font-mono z-50 text-white overflow-hidden">
        {/* Background Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(20,20,20,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(20,20,20,0.5)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
        
        <div className="relative z-10 w-full max-w-md p-8 animate-fade-in-up bg-black/50 backdrop-blur-sm border border-neutral-900 shadow-2xl">
            
            {/* Header */}
            <div className="text-center mb-6">
                <div className="flex justify-center mb-4">
                    <div className={`w-16 h-16 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center transition-colors duration-500 ${mode === 'signup' ? 'shadow-[0_0_30px_rgba(59,130,246,0.1)]' : 'shadow-[0_0_30px_rgba(249,115,22,0.1)]'}`}>
                         <ShieldCheck className={mode === 'signup' ? 'text-blue-500' : 'text-orange-500'} size={32} />
                    </div>
                </div>
                <h1 className="text-2xl font-bold tracking-[0.2em] mb-2">MOLIE<span className={mode === 'signup' ? 'text-blue-500' : 'text-orange-500'}>LM</span></h1>
                <p className="text-[10px] text-neutral-500 uppercase tracking-widest">HGI Security Gateway v3.2</p>
            </div>

            {/* Mode Tabs */}
            <div className="flex mb-6 border-b border-neutral-800">
                <button 
                    onClick={() => setMode('login')} 
                    className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider transition-colors ${mode === 'login' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-neutral-500 hover:text-white'}`}
                >
                    <div className="flex items-center justify-center gap-2"><LogIn size={14}/> Login</div>
                </button>
                <button 
                    onClick={() => setMode('signup')} 
                    className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider transition-colors ${mode === 'signup' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-neutral-500 hover:text-white'}`}
                >
                    <div className="flex items-center justify-center gap-2"><UserPlus size={14}/> Sign Up</div>
                </button>
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-6 bg-red-900/10 border border-red-900/50 p-3 flex items-center gap-3 animate-pulse">
                    <AlertTriangle size={16} className="text-red-500" />
                    <p className="text-[10px] text-red-400 uppercase font-bold">{error}</p>
                </div>
            )}

            {/* ================= LOGIN FLOW ================= */}
            {mode === 'login' && (
                <>
                    {/* LOGIN: STEP 1 (CREDS) */}
                    {loginStep === 'creds' && (
                        <div className="animate-fade-in-up">
                            <form onSubmit={(e) => { e.preventDefault(); handleSupabaseLogin(); }} className="space-y-4">
                                <div className="relative group">
                                    <input 
                                        type="email" 
                                        autoFocus
                                        value={loginEmail}
                                        onChange={(e) => setLoginEmail(e.target.value)}
                                        className="w-full bg-black border border-neutral-800 py-3 px-4 text-sm text-white focus:border-orange-500 outline-none transition-colors placeholder-neutral-700 font-mono tracking-widest"
                                        placeholder="EMAIL"
                                    />
                                </div>
                                <div className="relative group">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-orange-500 transition-colors" size={16} />
                                    <input 
                                        type="password" 
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                        className="w-full bg-black border border-neutral-800 py-3 pl-10 pr-4 text-sm text-white focus:border-orange-500 outline-none transition-colors placeholder-neutral-700 font-mono tracking-widest"
                                        placeholder="PASSWORD"
                                    />
                                </div>
                                <button 
                                    type="submit"
                                    disabled={isProcessing}
                                    className="w-full bg-orange-600 hover:bg-orange-500 text-black font-bold uppercase text-xs py-3 tracking-[0.2em] transition-all flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? (<><Loader2 className="animate-spin" size={14} /> Authenticating</>) : (<>Login <ChevronRight size={14} /></>)}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* LOGIN: STEP 2 (VOICE) */}
                    {loginStep === 'voice' && (
                        <div className="flex flex-col items-center animate-fade-in-up">
                            {pendingTranscript ? (
                                <div className="w-full">
                                    <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-2">Confirmación</p>
                                    <div className="bg-neutral-950 border border-neutral-800 p-3 mb-3">
                                        <p className="text-[10px] text-neutral-500 uppercase mb-1">Se escuchó:</p>
                                        <p className="text-sm text-white font-bold">"{pendingTranscript}"</p>
                                    </div>

                                    {pendingAudio && (
                                        <div className="mb-3">
                                            <audio ref={audioElRef} controls className="w-full" src={pendingAudio} />
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button
                                            onClick={resetPendingVoice}
                                            disabled={isProcessing}
                                            className="flex-1 text-[10px] text-neutral-300 uppercase hover:text-white py-2 border border-neutral-800"
                                        >
                                            Reintentar
                                        </button>
                                        <button
                                            onClick={acceptPendingVoice}
                                            disabled={isProcessing}
                                            className="flex-1 text-[10px] bg-orange-600 text-black font-bold uppercase py-2 hover:bg-orange-500"
                                        >
                                            {isProcessing ? "Procesando..." : "Aceptar"}
                                        </button>
                                    </div>
                                    <p className="mt-3 text-[10px] text-neutral-600">Si no coincide, presiona Reintentar y repite la frase.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="relative mb-6">
                                        <canvas ref={canvasRef} width={200} height={200} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                                        
                                        <button 
                                            onMouseDown={startRecording}
                                            onMouseUp={stopRecording}
                                            onTouchStart={startRecording}
                                            onTouchEnd={stopRecording}
                                            className={`relative w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${isRecording ? 'border-orange-500 bg-orange-500/10 scale-95' : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600'}`}
                                            disabled={isProcessing}
                                        >
                                             {isProcessing ? (
                                                 <Loader2 className="animate-spin text-orange-500" size={28} />
                                             ) : (
                                                 <Mic className={isRecording ? 'text-orange-500' : 'text-neutral-500'} size={28} />
                                             )}
                                        </button>
                                    </div>

                                    <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2">
                                        {isRecording ? "Listening..." : isProcessing ? "Transcribing..." : "Hold to Authenticate"}
                                    </p>
                                    <p className="text-[10px] text-neutral-600 mb-6">
                                        Di tu frase de seguridad registrada.
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ================= SIGNUP FLOW ================= */}
            {mode === 'signup' && (
                <>
                    {/* SIGNUP: STEP 1 (CREDS) */}
                    {signupStep === 1 && (
                        <div className="space-y-4 animate-fade-in-up">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase">Username</label>
                                <input 
                                    className="w-full bg-black border border-neutral-800 p-2 text-sm text-white focus:border-blue-500 outline-none font-mono"
                                    placeholder="e.g. Neo"
                                    value={newUsername}
                                    onChange={e => setNewUsername(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase">Email</label>
                                <input 
                                    type="email"
                                    className="w-full bg-black border border-neutral-800 p-2 text-sm text-white focus:border-blue-500 outline-none font-mono"
                                    placeholder="you@email.com"
                                    value={signupEmail}
                                    onChange={e => setSignupEmail(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase">Password</label>
                                <input 
                                    type="password"
                                    className="w-full bg-black border border-neutral-800 p-2 text-sm text-white focus:border-blue-500 outline-none font-mono"
                                    placeholder="******"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                />
                            </div>
                            <button 
                                onClick={() => {
                                    if (stage === 'legacy') {
                                        if(newUsername && newPassword) setSignupStep(2);
                                        else setError("Por favor completa todos los campos");
                                        return;
                                    }
                                    handleSupabaseSignup();
                                }}
                                disabled={isProcessing}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase text-xs py-3 tracking-widest mt-4"
                            >
                                {isProcessing ? "Creating Account..." : "Next: Voice Setup"}
                            </button>
                        </div>
                    )}

                    {/* SIGNUP: STEP 2 (MANDATORY VMV CALIBRATION) */}
                    {signupStep === 2 && (
                        <div className="flex flex-col items-center animate-fade-in-up">
                             <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-widest mb-2">VMV Calibration</h3>
                             <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-3">Lectura guiada (obligatoria)</p>

                             <div className="w-full bg-neutral-950 border border-neutral-800 p-3 mb-4">
                                 <p className="text-[10px] text-neutral-500 uppercase mb-2">Lee en voz alta este texto:</p>
                                 <p className="text-sm text-white font-bold leading-relaxed">"En un lugar de la Mancha, de cuyo nombre no quiero acordarme"</p>
                                 <p className="mt-2 text-[10px] text-neutral-600">Tip: habla claro durante 10–15 segundos.</p>
                             </div>

                             <div className="relative mb-6">
                                <canvas ref={canvasRef} width={200} height={200} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                                <button 
                                    onMouseDown={startRecording}
                                    onMouseUp={stopRecording}
                                    onTouchStart={startRecording}
                                    onTouchEnd={stopRecording}
                                    className={`relative w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${isRecording ? 'border-blue-500 bg-blue-500/10 scale-95' : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600'}`}
                                    disabled={isProcessing}
                                >
                                     {isProcessing ? (
                                         <Loader2 className="animate-spin text-blue-500" size={28} />
                                     ) : (
                                         <Mic className={isRecording ? 'text-blue-500' : 'text-neutral-500'} size={28} />
                                     )}
                                </button>
                             </div>

                            {pendingTranscript ? (
                                <div className="mb-4 text-center w-full">
                                    <p className="text-[10px] text-neutral-500 uppercase mb-1">Se escuchó:</p>
                                    <div className="bg-blue-900/20 border border-blue-900 p-2 text-blue-300 text-xs font-bold italic mb-3">"{pendingTranscript}"</div>
                                    {pendingAudio && (
                                        <div className="mb-3">
                                            <audio ref={audioElRef} controls className="w-full" src={pendingAudio} />
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                         <button onClick={resetPendingVoice} disabled={isProcessing} className="flex-1 text-[10px] text-neutral-500 uppercase hover:text-white py-2 border border-neutral-800">Reintentar</button>
                                         <button onClick={acceptPendingVoice} disabled={isProcessing} className="flex-1 text-[10px] bg-blue-600 text-white font-bold uppercase py-2 hover:bg-blue-500">{isProcessing ? "Guardando..." : "Confirmar"}</button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[10px] text-neutral-500 text-center max-w-xs">
                                    Mantén presionado y lee el texto. Luego confirma la transcripción.
                                </p>
                            )}

                             <button onClick={() => setSignupStep(1)} className="mt-6 text-[10px] text-neutral-600 hover:text-white uppercase">Back</button>
                        </div>
                    )}

                    {/* SIGNUP: STEP 3 (VOICE KEY ENROLLMENT) */}
                    {signupStep === 3 && (
                        <div className="flex flex-col items-center animate-fade-in-up">
                             <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-widest mb-2">Voice Key</h3>
                             <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-3">Frase de seguridad (obligatoria)</p>

                             <div className="relative mb-6">
                                <canvas ref={canvasRef} width={200} height={200} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                                <button 
                                    onMouseDown={startRecording}
                                    onMouseUp={stopRecording}
                                    onTouchStart={startRecording}
                                    onTouchEnd={stopRecording}
                                    className={`relative w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${isRecording ? 'border-blue-500 bg-blue-500/10 scale-95' : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600'}`}
                                    disabled={isProcessing}
                                >
                                     {isProcessing ? (
                                         <Loader2 className="animate-spin text-blue-500" size={28} />
                                     ) : (
                                         <Mic className={isRecording ? 'text-blue-500' : 'text-neutral-500'} size={28} />
                                     )}
                                </button>
                             </div>

                            {pendingTranscript ? (
                                <div className="mb-4 text-center w-full">
                                    <p className="text-[10px] text-neutral-500 uppercase mb-1">Se escuchó:</p>
                                    <div className="bg-blue-900/20 border border-blue-900 p-2 text-blue-300 text-xs font-bold italic mb-3">"{pendingTranscript}"</div>
                                    {pendingAudio && (
                                        <div className="mb-3">
                                            <audio ref={audioElRef} controls className="w-full" src={pendingAudio} />
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                         <button onClick={resetPendingVoice} disabled={isProcessing} className="flex-1 text-[10px] text-neutral-500 uppercase hover:text-white py-2 border border-neutral-800">Reintentar</button>
                                         <button onClick={acceptPendingVoice} disabled={isProcessing} className="flex-1 text-[10px] bg-blue-600 text-white font-bold uppercase py-2 hover:bg-blue-500">{isProcessing ? "Enrolling..." : "Aceptar"}</button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[10px] text-neutral-500 text-center max-w-xs">
                                    Mantén presionado y di una frase única (por ejemplo: "Soy el Admin" o "Wake up Neo").
                                </p>
                            )}

                             <button onClick={() => setSignupStep(2)} className="mt-6 text-[10px] text-neutral-600 hover:text-white uppercase">Back</button>
                        </div>
                    )}
                </>
            )}
            
            {/* Footer Actions */}
            <div className="absolute bottom-4 left-0 right-0 px-8 flex justify-between items-center">
                 <div className="flex items-center gap-2 text-[9px] text-neutral-700 uppercase">
                     <Activity size={10} /> Secure Connection
                 </div>
                 <button onClick={onOpenSettings} className="flex items-center gap-1 text-[9px] text-neutral-700 hover:text-orange-500 uppercase tracking-wider transition-colors">
                    <Settings size={10} /> System Config
                 </button>
            </div>
        </div>
    </div>
  );
};

export default LoginScreen;