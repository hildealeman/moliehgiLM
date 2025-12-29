
import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck, Activity, Loader2, AlertTriangle, LogIn, ChevronRight, Settings } from 'lucide-react';
import { supabase } from '../src/lib/supabase/client';
import { transcribeAudio } from '../src/services/geminiService';
import { storageService } from '../src/services/storageService';

interface LoginScreenProps {
  stage?: 'supabase' | 'voice' | 'legacy';
  onAuthed?: () => void;
  onVoiceVerified?: () => void;
  onOpenSettings: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ stage = 'legacy', onAuthed, onVoiceVerified, onOpenSettings }) => {
  // Login only
  const [loginStep, setLoginStep] = useState<'creds'>('creds');
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [voiceTranscript, setVoiceTranscript] = useState<string>("");
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);

  // Global UI State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
      setError(null);
      setIsRecording(false);
      setIsProcessing(false);
      setLoginStep('creds');
      setLoginEmail("");
      setLoginPassword("");
  }, []);

  useEffect(() => {
      // Stage ignored; login only.
      setLoginStep('creds');
  }, [stage]);

  const blobToDataUrl = (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Failed to read audio'));
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(blob);
      });
  };

  const startVoiceRecording = async () => {
      setError(null);
      setVoiceTranscript('');
      setIsRecording(true);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = '';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
      else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
          try {
              setIsProcessing(true);
              const recBlob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
              const audioDataUrl = await blobToDataUrl(recBlob);
              const transcription = await transcribeAudio(audioDataUrl);
              const cleanText = String(transcription || '').trim().replace(/[.,]/g, '');
              setVoiceTranscript(cleanText);

              const username = await storageService.verifyUserVoice(cleanText);
              if (!username) {
                  setError('Frase de voz no verificada. Intenta de nuevo.');
                  return;
              }

              onVoiceVerified?.();
          } catch (e: any) {
              setError(e?.message || 'Error al verificar voz');
          } finally {
              setIsProcessing(false);
              try {
                  stream.getTracks().forEach(t => t.stop());
              } catch {}
          }
      };

      mr.start();

      // Auto-stop to avoid huge payloads
      const MAX_MS = 6000;
      window.setTimeout(() => {
          try {
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                  stopVoiceRecording();
              }
          } catch {}
      }, MAX_MS);
  };

  const stopVoiceRecording = () => {
      setIsRecording(false);
      try {
          mediaRecorderRef.current?.stop();
      } catch (e: any) {
          setError(e?.message || 'Error al detener grabación');
      }
  };

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
      } catch (e: any) {
          setError(e.message || "Error al iniciar sesión");
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
                    <div className="w-16 h-16 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center transition-colors duration-500 shadow-[0_0_30px_rgba(249,115,22,0.1)]">
                         <ShieldCheck className="text-orange-500" size={32} />
                    </div>
                </div>
                <h1 className="text-2xl font-bold tracking-[0.2em] mb-2">MOLIE<span className="text-orange-500">LM</span></h1>
                <p className="text-[10px] text-neutral-500 uppercase tracking-widest">HGI Security Gateway v3.2</p>
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-6 bg-red-900/10 border border-red-900/50 p-3 flex items-center gap-3 animate-pulse">
                    <AlertTriangle size={16} className="text-red-500" />
                    <p className="text-[10px] text-red-400 uppercase font-bold">{error}</p>
                </div>
            )}

            <div className="animate-fade-in-up">
                {stage === 'voice' ? (
                    <div className="space-y-4">
                        <div className="text-[10px] text-neutral-500 uppercase tracking-widest">
                            Voice verification required
                        </div>

                        {voiceTranscript ? (
                            <div className="bg-neutral-900/30 border border-neutral-800 p-3">
                                <div className="text-[10px] text-neutral-500 uppercase tracking-widest mb-2">Transcript</div>
                                <div className="text-xs text-neutral-200 break-words">{voiceTranscript}</div>
                            </div>
                        ) : (
                            <div className="bg-neutral-900/20 border border-neutral-800 p-3">
                                <div className="text-[10px] text-neutral-500 uppercase tracking-widest">
                                    Presiona grabar y di tu frase
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => (isRecording ? stopVoiceRecording() : startVoiceRecording())}
                            className={`w-full ${isRecording ? 'bg-red-600 hover:bg-red-500' : 'bg-orange-600 hover:bg-orange-500'} text-black font-bold uppercase text-xs py-3 tracking-[0.2em] transition-all flex items-center justify-center gap-2`}
                        >
                            {isProcessing ? (
                                <><Loader2 className="animate-spin" size={14} /> Processing</>
                            ) : isRecording ? (
                                <>Stop <ChevronRight size={14} /></>
                            ) : (
                                <>Record <ChevronRight size={14} /></>
                            )}
                        </button>
                    </div>
                ) : (
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
                )}
            </div>
            
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