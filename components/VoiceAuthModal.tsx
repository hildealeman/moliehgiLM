import React, { useMemo, useRef, useState } from 'react';
import { X, Loader2, Phone, Check, Mic, ShieldCheck } from 'lucide-react';
import { transcribeAudio } from '../src/services/geminiService';
import { storageService } from '../src/services/storageService';

interface VoiceAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VoiceAuthModal: React.FC<VoiceAuthModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<'verify' | 'enroll'>('verify');
  const [phraseHint, setPhraseHint] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [transcript, setTranscript] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const title = useMemo(() => (mode === 'verify' ? 'Verificar Voz' : 'Enroll Voz'), [mode]);

  const resetUi = () => {
    setError(null);
    setStatus('');
    setTranscript('');
  };

  const cleanupStream = () => {
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
    } catch {}
    streamRef.current = null;
  };

  const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read audio'));
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  };

  const encodeWavPcm16 = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return buffer;
  };

  const webmBlobToWavDataUrl = async (blob: Blob): Promise<string> => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const mono = decoded.getChannelData(0);
    const wavBuffer = encodeWavPcm16(mono, decoded.sampleRate);
    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    try {
      await audioCtx.close();
    } catch {}
    return await blobToDataUrl(wavBlob);
  };

  const startRecording = async () => {
    resetUi();
    setIsRecording(true);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

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
        setStatus('Transcribiendo…');

        const recBlob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const wavDataUrl = await webmBlobToWavDataUrl(recBlob);
        const t = String(await transcribeAudio(wavDataUrl) || '').trim().replace(/[.,]/g, '');
        setTranscript(t);

        if (!t) {
          setError('Transcripción vacía. Intenta de nuevo.');
          return;
        }

        if (mode === 'verify') {
          setStatus('Verificando…');
          const username = await storageService.verifyUserVoice(t);
          if (!username) {
            setError('Frase de voz no verificada.');
            return;
          }
          setStatus(`Verificado como: ${username}`);
        } else {
          setStatus('Guardando enrollment…');
          const ok = await storageService.enrollUserVoice(t, phraseHint || null);
          if (!ok) {
            setError('No se pudo completar enrollment.');
            return;
          }
          setStatus('Enrollment completado.');
        }
      } catch (e: any) {
        setError(e?.message || 'Error en Voice Auth');
      } finally {
        setIsProcessing(false);
        cleanupStream();
      }
    };

    mr.start();
  };

  const stopRecording = () => {
    setIsRecording(false);
    try {
      mediaRecorderRef.current?.stop();
    } catch (e: any) {
      setError(e?.message || 'Error al detener grabación');
      cleanupStream();
    }
  };

  const hardClose = () => {
    try {
      if (isRecording) stopRecording();
    } catch {}
    cleanupStream();
    setIsRecording(false);
    setIsProcessing(false);
    resetUi();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[110] flex items-center justify-center p-4 font-mono">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md p-6 relative shadow-2xl animate-fade-in-up">
        <button onClick={hardClose} className="absolute top-4 right-4 text-neutral-500 hover:text-white">
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 border border-orange-500/20">
            {mode === 'verify' ? <ShieldCheck size={18} /> : <Phone size={18} />}
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold text-white uppercase tracking-widest">{title}</div>
            <div className="text-[10px] text-neutral-500 uppercase tracking-widest">Optional • You can stop anytime</div>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setMode('verify'); resetUi(); }}
            className={`flex-1 px-3 py-2 text-[10px] uppercase tracking-widest border ${mode === 'verify' ? 'border-orange-500 text-orange-500 bg-orange-500/10' : 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800/40'}`}
            disabled={isProcessing || isRecording}
          >
            Verify
          </button>
          <button
            type="button"
            onClick={() => { setMode('enroll'); resetUi(); }}
            className={`flex-1 px-3 py-2 text-[10px] uppercase tracking-widest border ${mode === 'enroll' ? 'border-orange-500 text-orange-500 bg-orange-500/10' : 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800/40'}`}
            disabled={isProcessing || isRecording}
          >
            Enroll
          </button>
        </div>

        {mode === 'enroll' && (
          <div className="mb-4">
            <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-2">Phrase hint (optional)</label>
            <input
              value={phraseHint}
              onChange={(e) => setPhraseHint(e.target.value)}
              placeholder="Ej: 'mi frase secreta'"
              className="w-full bg-black border border-neutral-700 p-3 text-sm text-white focus:border-orange-500 outline-none transition-colors font-mono"
              disabled={isProcessing || isRecording}
            />
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-900/10 border border-red-900/50 p-3">
            <div className="text-[10px] text-red-400 uppercase font-bold">{error}</div>
          </div>
        )}

        {(status || transcript) && (
          <div className="mb-4 bg-neutral-900/30 border border-neutral-800 p-3">
            {status && <div className="text-[10px] text-neutral-300 uppercase tracking-widest mb-2">{status}</div>}
            {transcript && (
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest mb-2">Transcript</div>
                <div className="text-xs text-neutral-200 break-words">{transcript}</div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => (isRecording ? stopRecording() : startRecording())}
            className={`flex-1 ${isRecording ? 'bg-red-600 hover:bg-red-500' : 'bg-orange-600 hover:bg-orange-500'} text-black font-bold uppercase text-xs py-3 tracking-[0.2em] transition-all flex items-center justify-center gap-2`}
          >
            {isProcessing ? (
              <><Loader2 className="animate-spin" size={14} /> Processing</>
            ) : isRecording ? (
              <>Stop <Check size={14} /></>
            ) : (
              <><Mic size={14} /> Record</>
            )}
          </button>
          <button
            type="button"
            onClick={hardClose}
            className="px-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold uppercase text-xs py-3 tracking-widest transition-all"
          >
            Close
          </button>
        </div>

        <div className="mt-4 text-[10px] text-neutral-600 leading-relaxed">
          {mode === 'verify'
            ? 'Verify calls voice-verify (requires Supabase session).'
            : 'Enroll calls voice-enroll (requires Supabase session).'}
        </div>
      </div>
    </div>
  );
};

export default VoiceAuthModal;
