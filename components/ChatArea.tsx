import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Globe, Image as ImageIcon, Sparkles, Brain, X, PlayCircle, Loader2, FileText, ChevronDown, ChevronRight, Zap, AlignLeft, Download, Lightbulb, Link2, Eye, MessageSquarePlus, Menu, Headphones, Network, Wand2, PauseCircle, FileAudio, FilePlus, Check, CassetteTape, Save, AlertTriangle, AlertCircle, ChefHat, Film } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage, ImageGenOptions, Source } from '../types';
import { generateTextResponse, generateImage, transcribeAudio, textToSpeech, analyzeImage, generateSuggestions, generatePodcastAudio } from '../src/services/geminiService';

interface ChatAreaProps {
  chatHistory: ChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  sources: Source[];
  onAddSource: (source: Source) => void;
  onOpenLive: () => void;
  onToggleSidebar?: () => void;
}

// Custom Animations for the loader
const loadingStyles = `
@keyframes shimmerOverlay {
  0% { transform: translateX(-150%) skewX(-15deg); }
  100% { transform: translateX(150%) skewX(-15deg); }
}
@keyframes textShimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes loadingBar {
  0% { width: 5%; left: 0%; }
  50% { width: 40%; left: 30%; }
  100% { width: 5%; left: 95%; }
}
`;

const ChatArea: React.FC<ChatAreaProps> = ({ chatHistory, setChatHistory, sources, onAddSource, onOpenLive, onToggleSidebar }) => {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const escapeXml = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&apos;");

  type MindMapNode = { id: string; text: string; depth: number; children: MindMapNode[] };

  const parseMindMapMarkdown = (md: string): MindMapNode | null => {
      const rawLines = String(md || "")
        .split(/\r?\n/)
        .map(l => l.replace(/\t/g, "  "))
        .filter(l => l.trim().length > 0);

      const lines = rawLines
        .map((line) => {
          const m = line.match(/^(\s*)[-*+]\s+(.*)$/);
          if (!m) return null;
          const indent = m[1] || "";
          const text = (m[2] || "").trim();
          const depth = Math.floor(indent.length / 2);
          return { depth, text };
        })
        .filter(Boolean) as { depth: number; text: string }[];

      if (lines.length === 0) return null;

      const root: MindMapNode = { id: "root", text: "Mind Map", depth: -1, children: [] };
      const stack: MindMapNode[] = [root];

      for (let i = 0; i < lines.length; i++) {
        const { depth, text } = lines[i];
        const node: MindMapNode = { id: `n_${i}`, text, depth, children: [] };

        while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
          stack.pop();
        }
        const parent = stack[stack.length - 1] || root;
        parent.children.push(node);
        stack.push(node);
      }

      // If there's a single top-level bullet, use it as title.
      if (root.children.length === 1) return root.children[0];
      return root;
  };

  const getMicErrorMessage = (err: any): string => {
    const name = String(err?.name || "");
    const msg = String(err?.message || err || "");
    const isSecure = typeof window !== 'undefined' ? !!(window as any).isSecureContext : true;

    if (!isSecure) {
      return "El micrófono requiere HTTPS (secure context). Abre la app en https:// y vuelve a intentar.";
    }

    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return [
        "Permiso de micrófono bloqueado.",
        "En iPhone (Chrome):",
        "1) iOS Settings → Chrome → Microphone → Allow",
        "2) iOS Settings → Privacy & Security → Microphone → Chrome ON",
        "3) Recarga la página e intenta de nuevo.",
      ].join("\n");
    }

    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return "No se encontró micrófono disponible en el dispositivo.";
    }

    if (name === 'NotSupportedError') {
      return "Tu navegador no soporta captura de micrófono en este modo. Prueba Safari o actualiza iOS.";
    }

    return `No se pudo iniciar el micrófono. ${msg}`;
  };

  const markdownComponents: any = {
      h1: (props: any) => <h1 className="text-lg md:text-xl font-extrabold tracking-tight text-white mb-3" {...props} />,
      h2: (props: any) => <h2 className="text-base md:text-lg font-bold tracking-tight text-white mt-5 mb-2" {...props} />,
      h3: (props: any) => <h3 className="text-sm md:text-base font-bold text-white mt-4 mb-2" {...props} />,
      h4: (props: any) => <h4 className="text-xs md:text-sm font-bold text-neutral-200 mt-3 mb-2 uppercase tracking-wider" {...props} />,
      p: (props: any) => <p className="text-xs md:text-sm leading-relaxed text-neutral-200 mb-3" {...props} />,
      ul: (props: any) => <ul className="text-xs md:text-sm list-disc pl-5 space-y-1 mb-3" {...props} />,
      ol: (props: any) => <ol className="text-xs md:text-sm list-decimal pl-5 space-y-1 mb-3" {...props} />,
      li: (props: any) => <li className="text-neutral-200" {...props} />,
      blockquote: (props: any) => <blockquote className="border-l-2 border-orange-500/70 pl-3 py-1 my-3 text-neutral-300 bg-black/20" {...props} />,
      strong: (props: any) => <strong className="text-white font-bold" {...props} />,
      em: (props: any) => <em className="text-neutral-100" {...props} />,
      code: (props: any) => <code className="bg-black/40 border border-neutral-800 px-1 py-0.5 rounded text-[11px] md:text-xs" {...props} />,
      pre: (props: any) => <pre className="bg-black/60 border border-neutral-800 p-3 rounded overflow-x-auto text-[11px] md:text-xs my-3" {...props} />,
      hr: () => <div className="my-4 border-t border-neutral-800" />,
      a: (props: any) => <a className="text-orange-400 hover:text-orange-300 underline" target="_blank" rel="noreferrer" {...props} />,
  };

  const mindMapToSvgDataUrl = (tree: MindMapNode): string => {
      const nodes: Array<{ node: MindMapNode; x: number; y: number }> = [];
      const edges: Array<{ fromId: string; toId: string }> = [];

      const xStep = 240;
      const yStep = 90;
      let yCursor = 40;

      const traverse = (n: MindMapNode, parent: MindMapNode | null) => {
        const depth = Math.max(n.depth, 0);
        const x = 40 + depth * xStep;
        const y = yCursor;
        yCursor += yStep;
        nodes.push({ node: n, x, y });
        if (parent) edges.push({ fromId: parent.id, toId: n.id });
        for (const c of n.children) traverse(c, n);
      };

      // Normalize root depth and traverse
      const normalizedRoot = { ...tree, depth: 0 } as MindMapNode;
      traverse(normalizedRoot, null);

      const nodeIndex = new Map(nodes.map(n => [n.node.id, n]));

      const maxX = Math.max(...nodes.map(n => n.x)) + 520;
      const maxY = Math.max(...nodes.map(n => n.y)) + 80;

      const svgParts: string[] = [];
      svgParts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}">`
      );
      svgParts.push(`<defs><style><![CDATA[
        .bg { fill: #0a0a0a; }
        .edge { stroke: rgba(249,115,22,0.55); stroke-width: 2; fill: none; }
        .box { fill: #111827; stroke: rgba(255,255,255,0.12); stroke-width: 1; rx: 10; }
        .title { fill: #fff; font: 600 14px ui-sans-serif, system-ui, -apple-system; }
        .text { fill: rgba(255,255,255,0.86); font: 12px ui-sans-serif, system-ui, -apple-system; }
      ]]></style></defs>`);
      svgParts.push(`<rect class="bg" x="0" y="0" width="${maxX}" height="${maxY}" />`);

      // edges
      for (const e of edges) {
        const a = nodeIndex.get(e.fromId);
        const b = nodeIndex.get(e.toId);
        if (!a || !b) continue;
        const x1 = a.x + 260;
        const y1 = a.y + 24;
        const x2 = b.x;
        const y2 = b.y + 24;
        const midX = (x1 + x2) / 2;
        svgParts.push(`<path class="edge" d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" />`);
      }

      // nodes
      const boxW = 260;
      const boxH = 56;
      for (const n of nodes) {
        const label = escapeXml(n.node.text.length > 80 ? n.node.text.slice(0, 77) + "…" : n.node.text);
        const isRoot = n.node.id === normalizedRoot.id;
        svgParts.push(`<g>`);
        svgParts.push(`<rect class="box" x="${n.x}" y="${n.y}" width="${boxW}" height="${boxH}" />`);
        svgParts.push(`<text x="${n.x + 14}" y="${n.y + 22}" class="${isRoot ? 'title' : 'text'}">${label}</text>`);
        svgParts.push(`</g>`);
      }

      svgParts.push(`</svg>`);

      const svg = svgParts.join("");
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };
  
  // Loading Message State
  const [loadingMsg, setLoadingMsg] = useState("");
  const loadingMessages = [
    "Pensando tu pregunta...",
    "Buscando en las fuentes...",
    "Conectando ideas...",
    "Cocinando todo...",
    "Mezclando los ingredientes...",
    "Horneando a fuego lento...",
    "Emplatando la respuesta..."
  ];

  // Image Analysis State
  const [activeImageAnalysis, setActiveImageAnalysis] = useState<string | null>(null);
  const [analysisPrompt, setAnalysisPrompt] = useState("");

  // Studio State
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [podcastLength, setPodcastLength] = useState<'short' | 'medium' | 'long'>('medium');

  // Persistent User Preferences
  const [useSearch, setUseSearch] = useState(() => localStorage.getItem('molielm_pref_useSearch') === 'true');
  const [useThinking, setUseThinking] = useState(() => localStorage.getItem('molielm_pref_useThinking') === 'true');
  const [showImageTools, setShowImageTools] = useState(() => localStorage.getItem('molielm_pref_showImageTools') === 'true');

  const [savedMsgIds, setSavedMsgIds] = useState<Set<string>>(new Set());
  const [savedAudioIds, setSavedAudioIds] = useState<Set<string>>(new Set());
  const [isChatSaved, setIsChatSaved] = useState(false);

  useEffect(() => {
    localStorage.setItem('molielm_pref_useSearch', String(useSearch));
  }, [useSearch]);

  useEffect(() => {
    localStorage.setItem('molielm_pref_useThinking', String(useThinking));
  }, [useThinking]);

  useEffect(() => {
    localStorage.setItem('molielm_pref_showImageTools', String(showImageTools));
  }, [showImageTools]);

  // Loading Message Cycler
  useEffect(() => {
      if (isProcessing) {
          let i = 0;
          setLoadingMsg(loadingMessages[0]);
          const interval = setInterval(() => {
              i = (i + 1) % loadingMessages.length;
              setLoadingMsg(loadingMessages[i]);
          }, 2500);
          return () => clearInterval(interval);
      }
  }, [isProcessing]);

  // Refresh suggestions
  useEffect(() => {
      const fetchSuggestions = async () => {
          if (sources.length === 0) {
              setSuggestions(["¿Qué es HGI?", "Crea un plan de estudio", "Analizar tendencias"]);
              return;
          }
          
          setIsLoadingSuggestions(true);
          try {
              const historyText = chatHistory.map(m => `${m.role}: ${m.text}`).slice(-5);
              const newSuggestions = await generateSuggestions(sources, historyText);
              if (newSuggestions.length > 0) {
                  setSuggestions(newSuggestions);
              }
          } catch (e) {
              // Suggestions failing should not alert the user, just log it
              console.warn("Suggestion fetch suppressed error");
          } finally {
              setIsLoadingSuggestions(false);
          }
      };

      const timer = setTimeout(fetchSuggestions, 1000);
      return () => clearTimeout(timer);
  }, [sources, chatHistory.length]);
  
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fallbackRecCtxRef = useRef<AudioContext | null>(null);
  const fallbackRecStreamRef = useRef<MediaStream | null>(null);
  const fallbackRecSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const fallbackRecProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const fallbackRecPcmRef = useRef<Int16Array[]>([]);
  const [imgOptions, setImgOptions] = useState<ImageGenOptions>({ aspectRatio: '1:1', size: '1K' });

  // Audio Player Logic (Raw PCM 24kHz)
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [isDownloadingAudio, setIsDownloadingAudio] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    bottomRef.current?.scrollIntoView({ behavior: isMobile ? 'auto' : 'smooth' });
  }, [chatHistory, isProcessing, activeImageAnalysis]);

  const toggleEvidence = (msgId: string) => {
    setExpandedEvidence(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  // Helper: Create WAV Header and Blob from Raw PCM
  const createWavBlob = (pcmData: Uint8Array, sampleRate: number = 24000): Blob => {
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      const blockAlign = numChannels * (bitsPerSample / 8);
      const dataSize = pcmData.length;
      const headerSize = 44;
      const totalSize = headerSize + dataSize;

      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);

      // RIFF chunk descriptor
      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeString(view, 8, 'WAVE');

      // fmt sub-chunk
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
      view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);

      // data sub-chunk
      writeString(view, 36, 'data');
      view.setUint32(40, dataSize, true);

      // Write PCM data
      const dataView = new Uint8Array(buffer, headerSize);
      dataView.set(pcmData);

      return new Blob([buffer], { type: 'audio/wav' });
  };

  const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
      }
  };

  const base64ToUint8Array = (base64: string): Uint8Array => {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
  };

  const downloadWav = (base64Data: string, filename: string) => {
      try {
          const pcmBytes = base64ToUint8Array(base64Data);
          const wavBlob = createWavBlob(pcmBytes, 24000); // Gemini TTS default
          const url = URL.createObjectURL(wavBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (e) {
          console.error("Error creating WAV", e);
          alert("Error al generar el archivo de audio.");
      }
  };

  const saveAudioAsSource = (pcmBytes: Uint8Array, filename: string, msgId: string) => {
      try {
          const wavBlob = createWavBlob(pcmBytes, 24000);
          const reader = new FileReader();
          reader.readAsDataURL(wavBlob);
          reader.onloadend = () => {
              const base64data = reader.result as string;
              onAddSource({
                  id: Date.now().toString(),
                  title: filename,
                  content: base64data,
                  type: 'file', // Treat as a file source
                  mimeType: 'audio/wav'
              });
              
              setSavedAudioIds(prev => new Set(prev).add(msgId));
              setTimeout(() => {
                  setSavedAudioIds(prev => {
                      const newSet = new Set(prev);
                      newSet.delete(msgId);
                      return newSet;
                  });
              }, 2000);
          };
      } catch (e) {
          console.error("Error saving audio source", e);
      }
  };

  const handleDownloadTTS = async (text: string, msgId: string) => {
      setIsDownloadingAudio(msgId);
      try {
          // Re-generate TTS to get the buffer (caching could be optimized in future)
          const audioBuffer = await textToSpeech(text);
          // Convert ArrayBuffer to Base64 string to reuse logic or directly use bytes
          const bytes = new Uint8Array(audioBuffer);
          const wavBlob = createWavBlob(bytes, 24000);
          
          const url = URL.createObjectURL(wavBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `MolieLM_Response_${msgId}.wav`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      } catch (e) {
          console.error("TTS Download failed", e);
      } finally {
          setIsDownloadingAudio(null);
      }
  };
  
  const handleSaveTTSAsSource = async (text: string, msgId: string) => {
      setIsDownloadingAudio(msgId); // Reuse loading state
      try {
          const audioBuffer = await textToSpeech(text);
          const bytes = new Uint8Array(audioBuffer);
          saveAudioAsSource(bytes, `Audio_Resp_${msgId.slice(-4)}.wav`, msgId);
      } catch (e) {
          console.error("TTS Save failed", e);
      } finally {
          setIsDownloadingAudio(null);
      }
  };

  // Helper to convert Base64 or ArrayBuffer PCM to AudioBuffer for Playback
  const playPcmAudio = (id: string, data: string | ArrayBuffer) => {
    // 1. Initialize Context
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    
    // Stop previous if playing
    if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
    }

    try {
        // 2. Process Data to Float32
        let float32Data: Float32Array;

        if (typeof data === 'string') {
             // Base64 string
             const bytes = base64ToUint8Array(data);
             const int16 = new Int16Array(bytes.buffer);
             float32Data = new Float32Array(int16.length);
             for (let i = 0; i < int16.length; i++) {
                 float32Data[i] = int16[i] / 32768.0;
             }
        } else {
             // ArrayBuffer
             const int16 = new Int16Array(data);
             float32Data = new Float32Array(int16.length);
             for (let i = 0; i < int16.length; i++) {
                 float32Data[i] = int16[i] / 32768.0;
             }
        }

        // 3. Create AudioBuffer
        const buffer = ctx.createBuffer(1, float32Data.length, 24000); // Gemini TTS is 24kHz
        buffer.copyToChannel(new Float32Array(float32Data), 0);

        // 4. Play
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => setPlayingAudioId(null);
        source.start(0);
        
        audioSourceRef.current = source;
        setPlayingAudioId(id);
        
        if (ctx.state === 'suspended') ctx.resume();

    } catch (e) {
        console.error("PCM Playback failed", e);
        setPlayingAudioId(null);
    }
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
    }
    setPlayingAudioId(null);
  };

  const toggleAudio = (id: string, base64Data: string) => {
    if (playingAudioId === id) {
        stopAudio();
    } else {
        playPcmAudio(id, base64Data);
    }
  };

  const parseRagResponse = (text: string): { cleanText: string, evidence: string[], reasoning: string } => {
    let evidence: string[] = [];
    let reasoning = "";
    let cleanText = text;

    if (text.includes("|||EVIDENCIA|||")) {
        const parts = text.split("|||EVIDENCIA|||");
        const contentAfterEv = parts[1]; 
        
        if (contentAfterEv.includes("|||RAZONAMIENTO|||")) {
            const evParts = contentAfterEv.split("|||RAZONAMIENTO|||");
            evidence.push(evParts[0].trim());
            
            const contentAfterReason = evParts[1];
            if (contentAfterReason.includes("|||RESPUESTA|||")) {
                const reasonParts = contentAfterReason.split("|||RESPUESTA|||");
                reasoning = reasonParts[0].trim();
                cleanText = reasonParts[1].trim();
            } else {
                reasoning = contentAfterReason.trim();
                cleanText = ""; 
            }
        } else {
             evidence.push(contentAfterEv.trim());
        }
    }
    
    return { cleanText, evidence, reasoning };
  };

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend
    };

    setChatHistory(prev => [...prev, userMsg]);
    setInput("");
    setIsProcessing(true);
    setSuggestions([]); 

    try {
      let finalPrompt = userMsg.text;
      if (useThinking) {
          finalPrompt += "\n\nIMPORTANTE: Utiliza el modo RAG (|||EVIDENCIA|||, |||RAZONAMIENTO|||, |||RESPUESTA|||) para responder.";
      }
      const historyText = chatHistory.map(m => `${m.role}: ${m.text}`).slice(-5);
      const response = await generateTextResponse(finalPrompt, historyText, sources, useThinking, useSearch);
      const { cleanText, evidence, reasoning } = parseRagResponse(response.text);

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: cleanText || response.text, 
        isThinking: useThinking,
        evidence: evidence.length > 0 ? evidence : undefined,
        reasoning: reasoning || undefined,
        sources: response.groundingMetadata?.groundingChunks?.map((c: any) => c.web?.uri).filter(Boolean)
      };

      setChatHistory(prev => [...prev, botMsg]);
    } catch (e: any) {
      console.error(e);
      // Display the actual error message which contains helpful info now
      setChatHistory(prev => [...prev, { 
          id: Date.now().toString(), 
          role: 'model', 
          text: e.message || "Error desconocido al procesar la solicitud."
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToSource = (text: string, id: string) => {
      const title = `Generado_${new Date().toLocaleTimeString('es-ES').replace(/:/g, '-')}_${id.slice(-4)}`;
      onAddSource({
          id: Date.now().toString(),
          title: title,
          content: text,
          type: 'text',
          mimeType: 'text/plain'
      });
      setSavedMsgIds(prev => new Set(prev).add(id));
      setTimeout(() => {
          setSavedMsgIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
          });
      }, 2000);
  };

  const handleSaveChatHistory = () => {
      if (chatHistory.length === 0) return;
      
      const content = chatHistory.map(m => {
          const role = m.role === 'user' ? 'USUARIO' : 'MOLIE_LM';
          return `${role}:\n${m.text}`;
      }).join('\n\n-----------------------------------\n\n');
      
      const title = `Chat_Log_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}_${new Date().toLocaleTimeString('es-ES').replace(/:/g, '-')}`;
      
      onAddSource({
          id: Date.now().toString(),
          title: title,
          content: content,
          type: 'text',
          mimeType: 'text/plain'
      });
      
      setIsChatSaved(true);
      setTimeout(() => setIsChatSaved(false), 2000);
  };

  // --- STUDIO FUNCTIONS ---

  const handleCreateReport = async () => {
      setIsStudioOpen(false);
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: "GENERAR_REPORTE_ESTRATEGICO" };
      setChatHistory(prev => [...prev, userMsg]);
      setIsProcessing(true);

      try {
          const prompt = "Actúa como un analista senior. Genera un informe detallado ('Deep Dive') en formato Markdown basado en todas las fuentes disponibles. Incluye: Resumen Ejecutivo, Puntos Clave, Análisis de Datos y Conclusiones. Usa encabezados claros.";
          const response = await generateTextResponse(prompt, [], sources, true, false);
          
          setChatHistory(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: 'model',
              text: response.text,
              isThinking: true // Assume reasoning used
          }]);
      } catch (e: any) {
          setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', text: e.message }]);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleCreatePodcast = async () => {
      setIsStudioOpen(false);
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: `GENERAR_AUDIO_PODCAST (${podcastLength.toUpperCase()})` };
      setChatHistory(prev => [...prev, userMsg]);
      setIsProcessing(true);

      try {
          // 1. Generate Script
          let lengthInstruction = "";
          if (podcastLength === 'short') {
              lengthInstruction = "muy corto (aprox. 150-200 palabras, ~1 min). Enfócate solo en el titular más importante.";
          } else if (podcastLength === 'medium') {
              lengthInstruction = "de longitud media (aprox. 600-700 palabras, ~4 min). Estilo 'Executive Briefing'. Cubre el resumen general y los puntos clave principales.";
          } else {
              lengthInstruction = "largo y detallado (aprox. 1500 palabras, ~8+ min). Estilo 'Deep Dive'. Analiza a fondo, debate las implicaciones, menciona detalles específicos de los archivos y explora matices.";
          }

          const scriptPrompt = `Escribe un guion de podcast entre dos anfitriones, Kore y Puck, discutiendo el contenido de las fuentes cargadas.
          
          Duración: ${lengthInstruction}
          
          Personajes:
          - Kore: Curiosa, hace preguntas perspicaces, guía el tema.
          - Puck: Analítico, experto, da las explicaciones profundas, usa analogías.
          
          Formato estricto (no uses marcadores de tiempo ni paréntesis de acción, solo nombres y texto de diálogo):
          Kore: [Texto]
          Puck: [Texto]
          Kore: [Texto]
          ...`;
          
          const scriptResponse = await generateTextResponse(scriptPrompt, [], sources, false, false);
          const script = scriptResponse.text;

          // 2. Generate Audio
          setChatHistory(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'model', text: `> SISTEMA: Generando guion (${podcastLength}) y sintetizando audio neuronal...\n\n${script.substring(0, 300)}...` }]);
          
          const audioBase64 = await generatePodcastAudio(script);

          setChatHistory(prev => [...prev, {
              id: (Date.now() + 2).toString(),
              role: 'model',
              text: `🎙️ AUDIO GENERADO (${podcastLength.toUpperCase()})`,
              audioData: audioBase64
          }]);

      } catch (e: any) {
          console.error(e);
          setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', text: e.message }]);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleCreateStudyGuide = async () => {
      setIsStudioOpen(false);
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: "GENERAR_GUIA_DE_ESTUDIO" };
      setChatHistory(prev => [...prev, userMsg]);
      setIsProcessing(true);

      try {
          const prompt = `Crea una guía de estudio en Markdown basada en las fuentes cargadas.

Incluye obligatoriamente:
1) Objetivos de aprendizaje (5-8)
2) Resumen estructurado
3) Conceptos clave (glosario)
4) Preguntas tipo examen (10) con respuestas al final
5) Actividades prácticas / ejercicios
6) Plan de estudio sugerido (3-7 días)

Tono: claro, académico, práctico. Responde en español.`;
          const response = await generateTextResponse(prompt, [], sources, false, false);
          setChatHistory(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: 'model',
              text: `### 📚 STUDY GUIDE\n\n${response.text}`
          }]);
      } catch (e: any) {
          setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', text: e.message }]);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleCreateBlogPost = async () => {
      setIsStudioOpen(false);
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: "GENERAR_BLOG_POST" };
      setChatHistory(prev => [...prev, userMsg]);
      setIsProcessing(true);

      try {
          const prompt = `Escribe un blog post en Markdown basado en las fuentes cargadas.

Requisitos:
- Título + subtítulo
- Introducción con hook
- 4 a 6 secciones con encabezados
- Ejemplos concretos referenciando las fuentes
- Conclusión + CTA
- Lista de "Lecturas relacionadas" (si aplica)

Tono: profesional, claro, no demasiado largo. Responde en español.`;
          const response = await generateTextResponse(prompt, [], sources, false, false);
          setChatHistory(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: 'model',
              text: `### 📝 BLOG POST\n\n${response.text}`
          }]);
      } catch (e: any) {
          setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', text: e.message }]);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleCreateVideoScript = async () => {
      setIsStudioOpen(false);
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: "GENERAR_GUION_DE_VIDEO" };
      setChatHistory(prev => [...prev, userMsg]);
      setIsProcessing(true);

      try {
          const prompt = `Crea un guion de video (5-8 minutos) basado en las fuentes cargadas.

Formato en Markdown:
- Título
- Hook (0:00-0:20)
- Estructura por secciones con timestamps aproximados
- Voz en off (VO)
- Visuales sugeridos (B-roll / on-screen text)
- Cierre + CTA

Tono: dinámico, claro, técnico pero accesible. Responde en español.`;
          const response = await generateTextResponse(prompt, [], sources, false, false);
          setChatHistory(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: 'model',
              text: `### 🎬 VIDEO SCRIPT\n\n${response.text}`
          }]);
      } catch (e: any) {
          setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', text: e.message }]);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleCreateStoryboard = async () => {
      setIsStudioOpen(false);
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: "GENERAR_STORYBOARD" };
      setChatHistory(prev => [...prev, userMsg]);
      setIsProcessing(true);

      try {
          const outlinePrompt = `Genera un storyboard de 4 paneles basado en las fuentes cargadas.

Devuelve SOLO JSON válido (sin markdown) con esta forma exacta:
{
  "style": "...",
  "panels": [
    {"title":"Panel 1", "caption":"...", "image_prompt":"..."},
    {"title":"Panel 2", "caption":"...", "image_prompt":"..."},
    {"title":"Panel 3", "caption":"...", "image_prompt":"..."},
    {"title":"Panel 4", "caption":"...", "image_prompt":"..."}
  ]
}

Reglas:
- image_prompt debe describir claramente la escena, composición y ambiente.
- NO incluyas texto dentro de la imagen ("no text").
- Estilo consistente y cinematográfico.
- Responde en español.`;

          const outline = await generateTextResponse(outlinePrompt, [], sources, false, false);

          let panels: Array<{ title: string; caption: string; image_prompt: string }> = [];
          let style = "";
          try {
              const parsed = JSON.parse(outline.text || "{}");
              style = String(parsed?.style || "");
              panels = Array.isArray(parsed?.panels) ? parsed.panels : [];
          } catch {
              panels = [];
          }

          if (panels.length !== 4) {
              // Fallback: create 4 generic prompts
              style = style || "cinematic storyboard, high contrast, clean composition";
              panels = [
                { title: "Panel 1", caption: "Apertura", image_prompt: "Apertura cinematográfica relacionada al tema principal, no text" },
                { title: "Panel 2", caption: "Contexto", image_prompt: "Escena explicando contexto del tema, no text" },
                { title: "Panel 3", caption: "Insight", image_prompt: "Visualización del insight clave, no text" },
                { title: "Panel 4", caption: "Cierre", image_prompt: "Cierre con sensación de conclusión y claridad, no text" },
              ];
          }

          setChatHistory(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: 'model',
              text: `> SISTEMA: Generando storyboard visual (4 paneles)...\n\n${style ? `**Style:** ${style}` : ''}`.trim()
          }]);

          const images: string[] = [];
          const captions: string[] = [];
          for (let i = 0; i < panels.length; i++) {
              const p = panels[i];
              const fullPrompt = `${style ? `Style: ${style}. ` : ''}${p.image_prompt}`;
              const img = await generateImage(fullPrompt, { aspectRatio: '16:9', size: '1K' });
              images.push(img);
              captions.push(`${p.title}: ${p.caption}`);
          }

          setChatHistory(prev => [...prev, {
              id: (Date.now() + 2).toString(),
              role: 'model',
              text: `### 🧩 STORYBOARD\n\n${captions.map(c => `- ${c}`).join('\n')}`,
              images
          }]);
      } catch (e: any) {
          setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', text: e.message }]);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleCreateMindMap = async () => {
      setIsStudioOpen(false);
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: "GENERAR_MAPA_MENTAL" };
      setChatHistory(prev => [...prev, userMsg]);
      setIsProcessing(true);

      try {
          const prompt = "Genera un mapa mental jerárquico de los conceptos clave en las fuentes. Utiliza formato de lista indentada con Markdown. Ejemplo:\n- Concepto Central\n  - Subtema A\n    - Detalle 1";
          const response = await generateTextResponse(prompt, [], sources, false, false);

          const tree = parseMindMapMarkdown(response.text);
          const mindMapImage = tree ? mindMapToSvgDataUrl(tree) : null;

          setChatHistory(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: 'model',
              text: `### 🧠 KNOWLEDGE GRAPH\n\n${response.text}`,
              ...(mindMapImage ? { images: [mindMapImage] } : {})
          }]);
      } catch (e: any) {
          setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', text: e.message }]);
      } finally {
          setIsProcessing(false);
      }
  };

  // --- EXISTING HANDLERS ---

  const handleAnalyzeRequest = async (image: string, prompt: string, userText: string) => {
      setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
      setIsProcessing(true);
      setActiveImageAnalysis(null);
      setAnalysisPrompt("");
      try {
          const analysis = await analyzeImage(image, prompt);
          setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', text: analysis }]);
      } catch (e: any) {
          setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', text: e.message }]);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleExportChat = () => {
      if (chatHistory.length === 0) return;
      const content = chatHistory.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `molie_export.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };

  const handleGenerateImage = async () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: `IMG_GEN_REQ: ${input}` };
    setChatHistory(prev => [...prev, userMsg]);
    setInput("");
    setIsProcessing(true);
    setShowImageTools(false);
    try {
      const b64Image = await generateImage(userMsg.text, imgOptions);
      setChatHistory(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `RENDER_COMPLETE: "${input}"`,
        images: [b64Image]
      }]);
    } catch (e: any) {
      setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', text: e.message }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
        if (typeof window !== 'undefined' && !(window as any).isSecureContext) {
          throw new Error('INSECURE_CONTEXT');
        }
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('GET_USER_MEDIA_UNAVAILABLE');
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const hasMediaRecorder = typeof window !== 'undefined' && typeof (window as any).MediaRecorder !== 'undefined';
        if (hasMediaRecorder) {
          let mimeType = '';
          try {
            if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
            else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
            else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
          } catch {}

          try {
            const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mediaRecorder.onstop = async () => {
              const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || audioChunksRef.current?.[0]?.type || 'audio/webm' });
              const reader = new FileReader();
              reader.readAsDataURL(audioBlob);
              reader.onloadend = async () => {
                const base64Audio = reader.result as string;
                setIsProcessing(true);
                try {
                  const transcription = await transcribeAudio(base64Audio);
                  if (transcription) setInput(prev => prev.trim() ? `${prev.trim()} ${transcription}` : transcription);
                } catch (e) {
                  console.error(e);
                } finally {
                  setIsProcessing(false);
                }
              };
            };
            mediaRecorder.start();
            setIsRecording(true);
            return;
          } catch {
            // Fall through to WebAudio fallback (some iOS builds expose MediaRecorder but fail on constructor)
          }
        }

        // WebAudio fallback (iOS Safari-friendly): capture PCM -> WAV
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        fallbackRecCtxRef.current = ctx;
        fallbackRecStreamRef.current = stream;
        fallbackRecPcmRef.current = [];
        try {
          if (ctx.state === 'suspended') await ctx.resume();
        } catch {}

        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          fallbackRecPcmRef.current.push(int16);
        };

        source.connect(processor);
        processor.connect(ctx.destination);
        fallbackRecSourceRef.current = source;
        fallbackRecProcessorRef.current = processor;

        setIsRecording(true);
    } catch (err) {
      console.error(err);
      const message = String((err as any)?.message || "");
      if (message === 'INSECURE_CONTEXT') {
        alert("El micrófono requiere HTTPS (secure context). Abre la app en https:// y vuelve a intentar.");
        return;
      }
      if (message === 'GET_USER_MEDIA_UNAVAILABLE') {
        alert("Este navegador no expone getUserMedia. En iPhone, Chrome usa WebKit: intenta Safari o habilita permisos de micrófono en iOS Settings.");
        return;
      }
      alert(getMicErrorMessage(err));
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;

    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      try {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      } catch {}
      mediaRecorderRef.current = null;
      setIsRecording(false);
      return;
    }

    // Stop WebAudio fallback
    const ctx = fallbackRecCtxRef.current;
    const stream = fallbackRecStreamRef.current;
    const processor = fallbackRecProcessorRef.current;
    const source = fallbackRecSourceRef.current;

    try {
      if (processor) processor.onaudioprocess = null;
    } catch {}
    try {
      processor?.disconnect();
    } catch {}
    try {
      source?.disconnect();
    } catch {}
    try {
      stream?.getTracks().forEach(t => t.stop());
    } catch {}
    try {
      ctx?.close();
    } catch {}

    fallbackRecProcessorRef.current = null;
    fallbackRecSourceRef.current = null;
    fallbackRecStreamRef.current = null;
    fallbackRecCtxRef.current = null;

    const chunks = fallbackRecPcmRef.current;
    fallbackRecPcmRef.current = [];
    setIsRecording(false);

    try {
      const totalLen = chunks.reduce((acc, a) => acc + a.length, 0);
      const merged = new Int16Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      const pcmBytes = new Uint8Array(merged.buffer);
      const wavBlob = createWavBlob(pcmBytes, 16000);
      const reader = new FileReader();
      reader.readAsDataURL(wavBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        setIsProcessing(true);
        try {
          const transcription = await transcribeAudio(base64Audio);
          if (transcription) setInput(prev => prev.trim() ? `${prev.trim()} ${transcription}` : transcription);
        } catch (e) {
          console.error(e);
        } finally {
          setIsProcessing(false);
        }
      };
    } catch (e) {
      console.error(e);
    }
  };

  const handleTTS = async (text: string) => {
      // Toggle logic for simple TTS could be implemented, but simple play is fine.
      // If something is already playing, stop it.
      if (playingAudioId === 'tts-active') {
          stopAudio();
          return;
      }
      
      try {
          const audioBuffer = await textToSpeech(text);
          playPcmAudio('tts-active', audioBuffer);
      } catch (e) { console.error("TTS failed", e); }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 relative font-mono">
      <style>{loadingStyles}</style>

      {/* Header */}
      <div className="min-h-[3.5rem] shrink-0 border-b border-neutral-800 flex items-center justify-between px-4 md:px-6 bg-black/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
             <button onClick={onToggleSidebar} className="md:hidden text-neutral-400 hover:text-white p-2 -ml-2">
                 <Menu size={20} />
             </button>
             <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                <Sparkles size={14} className="text-orange-500" />
                <span className="hidden sm:inline">Neural_Interface_v1.0</span>
                <span className="sm:hidden">HGI_v1</span>
            </h2>
        </div>
        <button onClick={onOpenLive} className="flex items-center gap-2 bg-orange-600 text-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-orange-500 transition-colors">
            <Zap size={10} className="fill-current" />
            <span className="hidden sm:inline">Live_Audio_Link</span>
            <span className="sm:hidden">LIVE</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6 space-y-6 md:space-y-8 scroll-smooth pb-32">
        {chatHistory.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-neutral-700">
                <Brain size={48} className="mb-4 text-neutral-800" />
                <p className="text-xs uppercase tracking-widest">Esperando entrada...</p>
            </div>
        )}
        
        {chatHistory.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-3xl p-4 md:p-5 border ${msg.role === 'user' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-neutral-900 border-neutral-800 text-neutral-300'} ${(msg.text.includes('⛔') || msg.text.includes('⚠️')) ? 'border-red-500 bg-red-900/10' : ''}`}>
                {msg.isThinking && (
                    <div className="flex items-center gap-2 text-[10px] font-bold text-purple-400 mb-3 uppercase tracking-widest">
                        <Brain size={12} /> Razonamiento profundo activo
                    </div>
                )}
                
                {/* Visual Alert for Errors */}
                {(msg.text.includes('⛔') || msg.text.includes('⚠️')) && (
                    <div className="mb-4 flex items-center gap-2 text-red-500 font-bold uppercase tracking-widest text-[10px] border-b border-red-900 pb-2">
                        {msg.text.includes('403') ? <AlertTriangle size={14} /> : <AlertCircle size={14} />}
                        {msg.text.includes('403') ? 'ALERTA DE SEGURIDAD: PROHIBIDO' : 'ERROR DEL SISTEMA: CLAVE INVÁLIDA'}
                    </div>
                )}
                
                {msg.images && msg.images.map((img, idx) => {
                    const uniqueImgId = `${msg.id}-${idx}`;
                    return (
                    <div key={idx} className="mb-4 border border-neutral-700 p-1 bg-black relative group">
                        <img src={img} alt="Content" className="max-w-full" />
                        {!isProcessing && (
                            <div className="mt-2 flex flex-wrap gap-2 md:absolute md:bottom-2 md:right-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity md:bg-black/60 md:p-1 md:rounded md:backdrop-blur-sm">
                                <button onClick={() => handleAnalyzeRequest(img, "Describe esta imagen detalladamente.", "Describe esta imagen.")} className="flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 text-white text-[10px] px-2 py-1 rounded border border-neutral-600 uppercase font-bold">
                                    <Eye size={12} /> <span className="hidden sm:inline">Describe</span>
                                </button>
                                <button onClick={() => { setActiveImageAnalysis(activeImageAnalysis === uniqueImgId ? null : uniqueImgId); setAnalysisPrompt(""); }} className={`flex items-center gap-1 hover:bg-neutral-700 text-white text-[10px] px-2 py-1 rounded border border-neutral-600 uppercase font-bold ${activeImageAnalysis === uniqueImgId ? 'bg-orange-600 border-orange-500' : 'bg-neutral-800'}`}>
                                    <MessageSquarePlus size={12} /> <span className="hidden sm:inline">Analizar</span>
                                </button>
                            </div>
                        )}
                        {/* Changed absolute to relative for mobile robustness */}
                        {activeImageAnalysis === uniqueImgId && (
                            <div className="relative mt-2 z-20 animate-fade-in-up">
                                <div className="bg-neutral-900 border border-orange-500 p-2 flex gap-2 shadow-xl">
                                    <input autoFocus className="flex-1 bg-black text-xs p-2 border border-neutral-700 focus:border-orange-500 outline-none text-white font-mono placeholder-neutral-600" placeholder="Pregunta sobre esta imagen..." value={analysisPrompt} onChange={(e) => setAnalysisPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && analysisPrompt.trim()) handleAnalyzeRequest(img, analysisPrompt, analysisPrompt); }} />
                                    <button onClick={() => { if (analysisPrompt.trim()) handleAnalyzeRequest(img, analysisPrompt, analysisPrompt); }} className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded text-[10px] uppercase font-bold"><Send size={14} /></button>
                                </div>
                            </div>
                        )}
                    </div>
                )})}

                {/* ... (Audio Player remains same) ... */}
                {msg.audioData && (
                    <div className="mb-4 bg-black/40 border border-neutral-700 p-3 flex items-center gap-4 rounded">
                        <button onClick={() => toggleAudio(msg.id, msg.audioData!)} className="text-orange-500 hover:text-white transition-colors">
                            {playingAudioId === msg.id ? <PauseCircle size={32} /> : <PlayCircle size={32} />}
                        </button>
                        <div className="flex-1">
                            <p className="text-xs font-bold text-white uppercase tracking-wider">Audio Overview</p>
                            <p className="text-[10px] text-neutral-500 font-mono">Podcast generated by Gemini</p>
                        </div>
                        <div className="flex gap-2 items-center">
                             <div className="flex gap-1 h-4 items-end mr-4">
                                {[...Array(5)].map((_, i) => <div key={i} className={`w-1 bg-orange-500 ${playingAudioId === msg.id ? 'animate-pulse' : 'opacity-30'}`} style={{height: `${Math.random() * 100}%`}}></div>)}
                             </div>
                             <button 
                                onClick={() => saveAudioAsSource(base64ToUint8Array(msg.audioData!), `Podcast_${msg.id.slice(-4)}.wav`, msg.id)}
                                className={`text-neutral-500 hover:text-green-500 transition-colors ${savedAudioIds.has(msg.id) ? 'text-green-500' : ''}`}
                                title="Guardar Podcast en Proyecto"
                             >
                                 {savedAudioIds.has(msg.id) ? <Check size={18} /> : <CassetteTape size={18} />}
                             </button>
                             <button 
                                onClick={() => downloadWav(msg.audioData!, `MolieLM_Podcast_${msg.id}.wav`)}
                                className="text-neutral-500 hover:text-white transition-colors"
                                title="Download Podcast (WAV)"
                             >
                                 <Download size={18} />
                             </button>
                        </div>
                    </div>
                )}

                {/* ... (Evidence/Reasoning blocks remain same) ... */}
                {(msg.evidence || msg.reasoning) && (
                    <div className="mb-4 space-y-2 font-mono">
                        {msg.evidence && (
                            <div className="bg-neutral-950 border-l-2 border-orange-500 p-3">
                                <button onClick={() => toggleEvidence(msg.id)} className="flex items-center gap-2 text-[10px] font-bold text-orange-500 w-full hover:text-orange-400 uppercase tracking-wider">
                                    {expandedEvidence[msg.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    Context_Chunks ({msg.evidence.length})
                                </button>
                                {expandedEvidence[msg.id] && (
                                    <div className="mt-2 text-[10px] text-neutral-500">
                                        {msg.evidence.map((e, i) => <p key={i} className="mb-1 border-b border-neutral-900 pb-1 last:border-0">"{e}"</p>)}
                                    </div>
                                )}
                            </div>
                        )}
                        {msg.reasoning && (
                            <div className="bg-neutral-950 border-l-2 border-purple-500 p-3">
                                <h4 className="text-[10px] font-bold text-purple-500 flex items-center gap-2 uppercase tracking-wider">
                                    <Brain size={12} /> Chain_Of_Thought
                                </h4>
                                <p className="mt-1 text-[10px] text-neutral-500 leading-relaxed">{msg.reasoning}</p>
                            </div>
                        )}
                    </div>
                )}

                <div className="max-w-none font-sans">
                    <ReactMarkdown components={markdownComponents}>{msg.text}</ReactMarkdown>
                </div>

                {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-neutral-800">
                        <div className="flex flex-wrap gap-2">
                            {msg.sources.map((src, i) => (
                                <a key={i} href={src} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-white bg-blue-900/20 hover:bg-blue-900/40 px-2 py-1 border border-blue-500/30 transition-colors rounded">
                                    <Globe size={10} />
                                    <span className="truncate max-w-[150px]">{new URL(src).hostname}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                )}
                
                {msg.role === 'model' && !msg.audioData && (
                    <div className="flex gap-2 mt-3 pt-2 border-t border-neutral-800/50">
                        <button onClick={() => handleTTS(msg.text)} className="text-neutral-600 hover:text-orange-500 transition-colors p-1" title="Playback">
                            <PlayCircle size={14} />
                        </button>
                        <button 
                            onClick={() => handleDownloadTTS(msg.text, msg.id)} 
                            className={`text-neutral-600 hover:text-blue-500 transition-colors p-1 ${isDownloadingAudio === msg.id ? 'animate-pulse text-blue-500' : ''}`} 
                            title="Download Audio"
                            disabled={isDownloadingAudio === msg.id}
                        >
                            {isDownloadingAudio === msg.id ? <Loader2 size={14} className="animate-spin" /> : <FileAudio size={14} />}
                        </button>
                        <button 
                            onClick={() => handleSaveTTSAsSource(msg.text, msg.id)} 
                            className={`text-neutral-600 hover:text-purple-500 transition-colors p-1 ${savedAudioIds.has(msg.id) ? 'text-purple-500' : ''}`}
                            title="Guardar Audio en Proyecto"
                        >
                            {savedAudioIds.has(msg.id) ? <Check size={14} /> : <CassetteTape size={14} />}
                        </button>
                        <button 
                            onClick={() => handleSaveToSource(msg.text, msg.id)}
                            className={`text-neutral-600 hover:text-green-500 transition-colors p-1 ${savedMsgIds.has(msg.id) ? 'text-green-500' : ''}`}
                            title="Convertir Texto a Fuente"
                        >
                            {savedMsgIds.has(msg.id) ? <Check size={14} /> : <FilePlus size={14} />}
                        </button>
                    </div>
                )}
            </div>
          </div>
        ))}
        
        {/* Modern Animated Loading State */}
        {isProcessing && (
             <div className="flex justify-start animate-fade-in-up">
                 <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-lg max-w-md w-full relative overflow-hidden group">
                     {/* Moving Light / Scanner Line Effect */}
                     <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/10 to-transparent w-full h-full pointer-events-none animate-[shimmerOverlay_2s_linear_infinite]" />
                     
                     <div className="flex items-center gap-4 relative z-10">
                         {/* Icon that changes or pulses */}
                         <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center border border-neutral-700 shadow-[0_0_15px_rgba(249,115,22,0.1)]">
                             <Sparkles className="text-orange-500 animate-pulse" size={16} />
                         </div>
                         
                         <div className="flex-1 min-w-0">
                             {/* The cycling text with a nice gradient style */}
                             <p className="text-sm font-bold bg-gradient-to-r from-neutral-500 via-neutral-100 to-neutral-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-[textShimmer_3s_linear_infinite] whitespace-nowrap overflow-hidden text-ellipsis">
                                 {loadingMsg}
                             </p>
                             {/* A fake progress bar or metadata line */}
                             <div className="flex gap-1 mt-2 relative h-0.5 bg-neutral-800 w-full overflow-hidden rounded">
                                  <div className="absolute top-0 h-full bg-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.8)] animate-[loadingBar_2s_ease-in-out_infinite]" />
                             </div>
                         </div>
                     </div>
                 </div>
             </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="bg-black/80 border-t border-neutral-800 backdrop-blur-sm relative z-20 pb-[env(safe-area-inset-bottom)]">
        
        {/* Studio Drawer (Mobile & Desktop) */}
        {isStudioOpen && (
            <div className="absolute bottom-full left-0 right-0 bg-neutral-900 border-t border-neutral-800 shadow-2xl animate-fade-in-up p-4 max-h-[60dvh] overflow-y-auto">
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center justify-between mb-4 sticky top-0 bg-neutral-900 z-10 py-1">
                        <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                            <Wand2 size={14} className="text-orange-500" /> Studio Gen
                        </h3>
                        <button onClick={() => setIsStudioOpen(false)} className="text-neutral-500 hover:text-white p-2"><X size={16}/></button>
                    </div>

                    {/* Podcast Settings */}
                    <div className="mb-4 bg-black/50 p-2 border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <Headphones size={12} /> Configuración Podcast
                        </span>
                        <div className="flex bg-neutral-900 p-1 rounded border border-neutral-800 w-full sm:w-auto">
                            <button 
                                onClick={() => setPodcastLength('short')}
                                className={`flex-1 sm:flex-none px-3 py-1 text-[10px] uppercase font-bold transition-colors rounded-sm ${podcastLength === 'short' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                            >
                                Corto (1m)
                            </button>
                            <button 
                                onClick={() => setPodcastLength('medium')}
                                className={`flex-1 sm:flex-none px-3 py-1 text-[10px] uppercase font-bold transition-colors rounded-sm ${podcastLength === 'medium' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                            >
                                Medio (4m)
                            </button>
                            <button 
                                onClick={() => setPodcastLength('long')}
                                className={`flex-1 sm:flex-none px-3 py-1 text-[10px] uppercase font-bold transition-colors rounded-sm ${podcastLength === 'long' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                            >
                                Deep Dive (8m+)
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button onClick={handleCreateReport} className="flex flex-col items-center justify-center p-4 bg-black border border-neutral-800 hover:border-blue-500 hover:bg-blue-500/10 transition-all gap-2 group min-h-[100px]">
                            <FileText size={24} className="text-blue-500 mb-1 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-neutral-300">Briefing Doc</span>
                            <span className="text-[9px] text-neutral-600 text-center">Markdown Report</span>
                        </button>
                        <button onClick={handleCreateStudyGuide} className="flex flex-col items-center justify-center p-4 bg-black border border-neutral-800 hover:border-indigo-500 hover:bg-indigo-500/10 transition-all gap-2 group min-h-[100px]">
                            <ChefHat size={24} className="text-indigo-500 mb-1 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-neutral-300">Study Guide</span>
                            <span className="text-[9px] text-neutral-600 text-center">Learning Plan</span>
                        </button>
                        <button onClick={handleCreatePodcast} className="flex flex-col items-center justify-center p-4 bg-black border border-neutral-800 hover:border-pink-500 hover:bg-pink-500/10 transition-all gap-2 group min-h-[100px]">
                            <Headphones size={24} className="text-pink-500 mb-1 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-neutral-300">Audio Overview</span>
                            <span className="text-[9px] text-neutral-600 text-center">Neural Podcast</span>
                        </button>
                        <button onClick={handleCreateMindMap} className="flex flex-col items-center justify-center p-4 bg-black border border-neutral-800 hover:border-green-500 hover:bg-green-500/10 transition-all gap-2 group min-h-[100px]">
                            <Network size={24} className="text-green-500 mb-1 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-neutral-300">Mind Map</span>
                            <span className="text-[9px] text-neutral-600 text-center">Knowledge Graph</span>
                        </button>
                        <button onClick={handleCreateBlogPost} className="flex flex-col items-center justify-center p-4 bg-black border border-neutral-800 hover:border-amber-500 hover:bg-amber-500/10 transition-all gap-2 group min-h-[100px]">
                            <AlignLeft size={24} className="text-amber-500 mb-1 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-neutral-300">Blog Post</span>
                            <span className="text-[9px] text-neutral-600 text-center">Publish-ready</span>
                        </button>
                        <button onClick={handleCreateVideoScript} className="flex flex-col items-center justify-center p-4 bg-black border border-neutral-800 hover:border-cyan-500 hover:bg-cyan-500/10 transition-all gap-2 group min-h-[100px]">
                            <Film size={24} className="text-cyan-500 mb-1 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-neutral-300">Video Script</span>
                            <span className="text-[9px] text-neutral-600 text-center">VO + Shots</span>
                        </button>
                        <button onClick={handleCreateStoryboard} className="flex flex-col items-center justify-center p-4 bg-black border border-neutral-800 hover:border-orange-500 hover:bg-orange-500/10 transition-all gap-2 group min-h-[100px]">
                            <ImageIcon size={24} className="text-orange-500 mb-1 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-neutral-300">Storyboard</span>
                            <span className="text-[9px] text-neutral-600 text-center">4 Panels</span>
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="p-4 md:p-6 max-w-4xl mx-auto">
            {/* Suggestions Chips */}
            {suggestions.length > 0 && !isProcessing && (
                <div className="flex gap-2 overflow-x-auto mb-3 pb-1 scrollbar-hide">
                    <div className="flex items-center gap-1 text-[10px] text-orange-500 uppercase font-bold mr-2 whitespace-nowrap">
                        <Lightbulb size={12} />
                        Suggestions:
                    </div>
                    {suggestions.map((s, i) => (
                        <button key={i} onClick={() => handleSend(s)} className="bg-neutral-900 border border-neutral-800 hover:border-orange-500 text-neutral-400 hover:text-orange-500 px-3 py-1.5 text-[10px] rounded-full whitespace-nowrap transition-colors animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                            {s}
                        </button>
                    ))}
                </div>
            )}
            
            {/* Tools Panel */}
            {showImageTools && (
                <div className="mb-3 p-3 bg-neutral-900 border border-neutral-800 flex flex-wrap items-center gap-4 animate-fade-in-up">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase">Aspect:</span>
                        <select className="text-xs bg-black text-neutral-300 p-1 border border-neutral-700" value={imgOptions.aspectRatio} onChange={(e) => setImgOptions({...imgOptions, aspectRatio: e.target.value as any})}>
                            <option value="1:1">1:1</option>
                            <option value="16:9">16:9</option>
                            <option value="9:16">9:16</option>
                        </select>
                    </div>
                    <button onClick={handleGenerateImage} className="ml-auto bg-purple-600 text-white text-[10px] font-bold px-3 py-1.5 uppercase hover:bg-purple-700">Render</button>
                </div>
            )}

            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 px-1 overflow-x-auto pb-2 md:pb-0 md:flex-wrap scrollbar-hide">
                    {/* ... (Tool buttons remain same, just ensure scrollbar-hide class is used) ... */}
                    <button onClick={() => setUseSearch(!useSearch)} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider border transition-all ${useSearch ? 'bg-blue-900/30 text-blue-400 border-blue-500/50' : 'bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-600'}`}>
                        <Globe size={12} /> <span className="inline">Search</span>
                    </button>
                    <button onClick={() => setUseThinking(!useThinking)} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider border transition-all ${useThinking ? 'bg-purple-900/30 text-purple-400 border-purple-500/50' : 'bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-600'}`}>
                        <Brain size={12} /> <span className="inline">Think</span>
                    </button>
                     <button onClick={() => setShowImageTools(!showImageTools)} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider border transition-all ${showImageTools ? 'bg-pink-900/30 text-pink-400 border-pink-500/50' : 'bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-600'}`}>
                        <ImageIcon size={12} /> <span className="inline">Img</span>
                    </button>
                    <div className="h-4 w-px bg-neutral-800 mx-1 flex-shrink-0"></div>
                    <button onClick={() => setIsStudioOpen(!isStudioOpen)} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider border transition-all ${isStudioOpen ? 'bg-orange-600 text-white border-orange-500' : 'bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-600'}`}>
                        <Wand2 size={12} /> <span className="inline">Studio</span>
                    </button>
                    <button onClick={handleSaveChatHistory} disabled={chatHistory.length === 0} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider border transition-all bg-neutral-900 border-neutral-800 hover:border-neutral-600 ${chatHistory.length === 0 ? 'opacity-50 cursor-not-allowed text-neutral-600' : isChatSaved ? 'text-green-500 border-green-500 hover:border-green-500' : 'text-neutral-500 hover:text-white'}`}>
                        {isChatSaved ? <Check size={12} /> : <Save size={12} />} 
                        <span className="inline">Save</span>
                    </button>
                    <button onClick={handleExportChat} disabled={chatHistory.length === 0} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider border transition-all bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-600 hover:text-white ${chatHistory.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <Download size={12} /> <span className="inline">Export</span>
                    </button>
                </div>

                <div className="relative flex items-center bg-neutral-900 border border-neutral-800 focus-within:border-orange-500 transition-all rounded-lg overflow-hidden">
                    {/* Reduce right padding on mobile to prevent text cut-off by absolute buttons */}
                    <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={isRecording ? "LISTENING..." : "ENTER_QUERY..."} className="w-full bg-transparent p-4 pr-24 outline-none resize-none min-h-[60px] max-h-[120px] text-neutral-200 placeholder-neutral-600 font-mono text-sm" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}} />
                    <div className="absolute right-2 flex items-center gap-1">
                        <button onClick={isRecording ? stopRecording : startRecording} className={`p-2 transition-all rounded-full ${isRecording ? 'text-red-500 bg-red-900/20 animate-pulse' : 'text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800'}`}><Mic size={18} /></button>
                        <button onClick={() => handleSend()} disabled={!input.trim() || isProcessing} className={`p-2 transition-all rounded-full ${input.trim() ? 'text-orange-500 hover:text-orange-400 hover:bg-orange-900/20' : 'text-neutral-700 cursor-not-allowed'}`}><Send size={18} /></button>
                    </div>
                </div>
            </div>
            <p className="text-center text-[9px] text-neutral-700 mt-2 uppercase tracking-widest font-mono">HGI System v2.5 // Output may vary based on stochastic parameters.</p>
        </div>
      </div>
    </div>
  );
};

export default ChatArea;