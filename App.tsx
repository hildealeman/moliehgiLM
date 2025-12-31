import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import LiveAudio from './components/LiveAudio';
import ApiKeyModal from './components/ApiKeyModal';
import LoginScreen from './components/LoginScreen';
import VoiceAuthModal from './components/VoiceAuthModal';
import { Source, ChatMessage, SourceHistoryItem, Project, UserProfile } from './types';
import { storageService } from './src/services/storageService';
import { getEffectiveApiKey, getSystemApiKey, setStoredApiKey, extractTextFromMultimodal } from './src/services/geminiService';
import { supabase } from './src/lib/supabase/client';
import { Menu } from 'lucide-react';

const isUuid = (value: string): boolean => {
  // Covers UUID v1-v5.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const MOLIELM_BUILD = 'b822e41';

const estimateContentBytes = (source: Source): number | undefined => {
  try {
    if (source.type === 'text') {
      return new Blob([source.content || ""]).size;
    }
    const content = String(source.content || "");
    if (content.startsWith('data:')) {
      const base64 = content.split(',')[1] || "";
      return Math.floor((base64.length * 3) / 4);
    }
    return new Blob([content]).size;
  } catch {
    return undefined;
  }
};

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile>(storageService.getUser());
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const [sources, setSources] = useState<Source[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [sourceHistory, setSourceHistory] = useState<SourceHistoryItem[]>([]);
  
  const [isLiveOpen, setIsLiveOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMirrorMode, setIsMirrorMode] = useState(false);
  
  const [hasSupabaseSession, setHasSupabaseSession] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showVoiceAuthModal, setShowVoiceAuthModal] = useState(false);

  const autoSaveRef = useRef({ sources, chatHistory, sourceHistory, activeProjectId, projects });
  const chatSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      (window as any).__MOLIELM_BUILD__ = MOLIELM_BUILD;
    } catch {}
  }, []);

  useEffect(() => {
    autoSaveRef.current = { sources, chatHistory, sourceHistory, activeProjectId, projects };
  }, [sources, chatHistory, sourceHistory, activeProjectId, projects]);

  // Initial Load - Now Async
  useEffect(() => {
    const loadData = async () => {
        // Track Supabase session state (required for Cloud mode with RLS)
        if (supabase) {
            try {
                const { data, error } = await supabase.auth.getSession();
                if (error) {
                    const msg = String((error as any)?.message || error);
                    const lower = msg.toLowerCase();
                    if (
                        lower.includes('refresh token') ||
                        lower.includes('invalid refresh') ||
                        lower.includes('session_not_found') ||
                        lower.includes('session from session_id claim')
                    ) {
                        try {
                            await supabase.auth.signOut();
                        } catch {}
                        try {
                            for (const k of Object.keys(localStorage)) {
                                if (k.startsWith('sb-')) localStorage.removeItem(k);
                            }
                        } catch {}
                        setHasSupabaseSession(false);
                    }
                }
                setHasSupabaseSession(!!data?.session);
            } catch {
                setHasSupabaseSession(false);
            }
            const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
                setHasSupabaseSession(!!session);
            });
            // Avoid leaking listener
            // @ts-ignore
            (loadData as any)._unsub = sub?.subscription;
        }

        const loadedProjects = await storageService.getProjects();

        let isSupabase = false;
        try {
           // @ts-ignore
           isSupabase = (import.meta && import.meta.env && import.meta.env.VITE_DATA_PROVIDER === 'supabase');
        } catch(e) {}

        // In Supabase mode, project IDs must be UUID. Filter out legacy numeric projects
        // to avoid 22P02 errors when writing sources/messages.
        const validProjects = isSupabase
          ? loadedProjects.filter((p) => isUuid(String(p.id)))
          : loadedProjects;

        setProjects(validProjects);

        if (validProjects.length > 0) {
          loadProject(validProjects[0]);
        } else {
            // If no projects, check if we need to create default (Mock only)
            // Use safe check for environment var
            if (!isSupabase) {
                const defaultProject = storageService.createProject("PROYECTO_ALPHA_01");
                setProjects([defaultProject]);
                loadProject(defaultProject);
            } else {
                // In cloud mode, don't auto-create a project without a valid session.
                setActiveProjectId(null);
                setSources([]);
                setChatHistory([]);
                setSourceHistory([]);
            }
        }
        
        if (!getEffectiveApiKey()) {
            setShowApiKeyModal(true);
        }
    };
    loadData();

    return () => {
        try {
            // @ts-ignore
            const sub = (loadData as any)._unsub;
            if (sub) sub.unsubscribe();
        } catch {}
    };
  }, []);

  // Save changes
  useEffect(() => {
    if (!activeProjectId) return;

    // Prevent invalid uuid writes in Supabase mode (legacy numeric IDs).
    try {
      // @ts-ignore
      const isSupabase = (import.meta && import.meta.env && import.meta.env.VITE_DATA_PROVIDER === 'supabase');
      if (isSupabase && !isUuid(String(activeProjectId))) return;
    } catch {}

    const projectToUpdate = projects.find(p => p.id === activeProjectId);
    if (!projectToUpdate) return;

    const updatedProject: Project = {
        ...projectToUpdate,
        sources,
        chatHistory,
        sourceHistory,
        updatedAt: Date.now()
    };

    // Fire and forget save
    storageService.saveProject(updatedProject);
    setProjects(prev => prev.map(p => p.id === activeProjectId ? updatedProject : p));
  }, [sources, chatHistory, sourceHistory, activeProjectId]);

  // Persist chat history per-project in Supabase mode (debounced)
  useEffect(() => {
    if (!activeProjectId) return;

    let isSupabase = false;
    try {
      // @ts-ignore
      isSupabase = (import.meta && import.meta.env && import.meta.env.VITE_DATA_PROVIDER === 'supabase');
    } catch {}
    if (!isSupabase) return;
    if (!isUuid(String(activeProjectId))) return;

    if (chatSaveTimerRef.current) {
      window.clearTimeout(chatSaveTimerRef.current);
      chatSaveTimerRef.current = null;
    }

    chatSaveTimerRef.current = window.setTimeout(() => {
      try {
        storageService.saveChatHistory(activeProjectId, chatHistory);
      } catch {}
    }, 800);

    return () => {
      if (chatSaveTimerRef.current) {
        window.clearTimeout(chatSaveTimerRef.current);
        chatSaveTimerRef.current = null;
      }
    };
  }, [chatHistory, activeProjectId]);

  const loadProject = (project: Project) => {
      try {
        // @ts-ignore
        const isSupabase = (import.meta && import.meta.env && import.meta.env.VITE_DATA_PROVIDER === 'supabase');
        if (isSupabase && !isUuid(String(project.id))) {
          setActiveProjectId(null);
          setSources([]);
          setChatHistory([]);
          setSourceHistory([]);
          return;
        }
      } catch {}
      setActiveProjectId(project.id);
      setSources(project.sources);
      setChatHistory(project.chatHistory);
      setSourceHistory(project.sourceHistory);
  };

  const handleSwitchProject = (id: string) => {
      const project = projects.find(p => p.id === id);
      if (project) loadProject(project);
      setIsSidebarOpen(false);
  };

  const handleCreateProject = (name: string, cloneSourceId?: string) => {
      const newProject = storageService.createProject(name);
      // Logic for cloning could be moved to service, kept simple here for now
      setProjects(prev => [...prev, newProject]);
      loadProject(newProject);
      setIsSidebarOpen(false);
  };

  const handleDeleteProject = async (id: string) => {
      // Async delete
      const remaining = await storageService.deleteProject(id);
      setProjects(remaining);
      if (activeProjectId === id) {
          if (remaining.length > 0) {
              loadProject(remaining[0]);
          } else {
              handleCreateProject("NUEVO_PROYECTO");
          }
      }
  };

  const handleClearChat = () => {
    if (window.confirm("¿Estás seguro de que quieres borrar todo el historial?")) {
      setChatHistory([]);
      setIsSidebarOpen(false);
    }
  };

  const handleLogout = () => {
      try {
          if (supabase) {
              supabase.auth.signOut();
          }
      } catch {}
      setHasSupabaseSession(false);
  };

  const handleUpdateUser = async (updatedUser: UserProfile) => {
      setUser(updatedUser);
      await storageService.updateUserProfile(updatedUser);
  };

  const buildAutoSummaryMarkdown = (source: Source, text: string, isPreliminary: boolean): string => {
      const raw = String(text || "").replace(/\r/g, "").trim();
      const title = source.title || "Fuente";
      const kind = source.type === 'text' ? 'Texto' : (source.type === 'image' ? 'Imagen' : 'Archivo');
      const words = raw ? raw.split(/\s+/).filter(Boolean).length : 0;

      if (!raw) {
          return `### Resumen automático\n\n**Fuente:** \`${title}\`\n\nNo hay texto disponible para resumir.`;
      }

      const lines = raw
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);

      const firstParagraph = raw.split(/\n\n+/)[0]?.trim() || raw.slice(0, 800);
      const tldr = firstParagraph.replace(/\s+/g, ' ').slice(0, 320);

      const keyPoints = lines
        .filter(l => l.length >= 30)
        .slice(0, 6)
        .map(l => l.length > 160 ? `${l.slice(0, 157)}...` : l);

      const questions = [
        "¿Cuáles son los conceptos principales?",
        "¿Qué decisiones o conclusiones sugiere?",
        "¿Qué datos o evidencias incluye?",
      ];

      const headerLine = isPreliminary
        ? "### Resumen automático (preliminar)"
        : "### Resumen automático";

      const meta = `**Fuente:** \`${title}\`  \n**Tipo:** ${kind}  \n**Longitud:** ~${words.toLocaleString()} palabras`;

      const bullets = keyPoints.length
        ? keyPoints.map(p => `- ${p}`).join("\n")
        : "- (No se detectaron líneas con contenido suficiente para extraer puntos clave)";

      const qBullets = questions.map(q => `- ${q}`).join("\n");

      return [
        headerLine,
        "",
        meta,
        "",
        "#### TL;DR",
        `> ${tldr}`,
        "",
        "#### Puntos clave",
        bullets,
        "",
        "#### Preguntas sugeridas",
        qBullets,
      ].join("\n");
  };

  const upsertChatMessage = (msg: ChatMessage) => {
      setChatHistory(prev => {
          const idx = prev.findIndex(m => m.id === msg.id);
          if (idx === -1) return [...prev, msg];
          const copy = prev.slice();
          copy[idx] = { ...copy[idx], ...msg };
          return copy;
      });
  };

  const addSource = async (source: Source) => {
    let persisted: Source = source;
    try {
        if (activeProjectId) {
            try {
              // @ts-ignore
              const isSupabase = (import.meta && import.meta.env && import.meta.env.VITE_DATA_PROVIDER === 'supabase');
              if (isSupabase && !isUuid(String(activeProjectId))) {
                throw new Error('Invalid project id for Supabase mode');
              }
            } catch (e) {
              throw e;
            }
            persisted = await storageService.addSource(activeProjectId, source);
        }
    } catch (e) {
        console.warn('addSource persistence failed', e);
    }

    setSources(prev => [...prev, persisted]);

    const summaryId = `source-summary-${persisted.id}`;
    const immediateText = persisted.type === 'text' ? (persisted.content || "") : (persisted.extractedText || "");
    const isPreliminary = persisted.type !== 'text' && !persisted.extractedText;
    const summary = buildAutoSummaryMarkdown(persisted, immediateText, isPreliminary);
    upsertChatMessage({
        id: summaryId,
        role: 'model',
        text: summary,
    });

    setSourceHistory(prev => [
      {
        id: `hist-${persisted.id}-${Date.now()}`,
        timestamp: Date.now(),
        type: 'added',
        sourceTitle: persisted.title,
        contentType: persisted.mimeType || persisted.type,
        size: estimateContentBytes(persisted),
      },
      ...prev,
    ]);
    
    // ... [Calculations for History Item] ...
    // Note: In Cloud mode, we might want to upload first, but for optimistic UI we update state immediately
    // Ideally, storageService.addSource handles the upload async

    // Trigger background text extraction
    if (persisted.type !== 'text' && !persisted.extractedText) {
        extractTextFromMultimodal(persisted).then(extracted => {
            if (extracted) {
                setSources(prev => prev.map(s => s.id === persisted.id ? { ...s, extractedText: extracted } : s));

                const finalSummary = buildAutoSummaryMarkdown(persisted, extracted, false);
                upsertChatMessage({
                    id: summaryId,
                    role: 'model',
                    text: finalSummary,
                });
            }
        });
    }
  };

  const removeSource = (id: string) => {
    const toRemove = sources.find(s => s.id === id);
    try {
        if (activeProjectId) {
            try {
              // @ts-ignore
              const isSupabase = (import.meta && import.meta.env && import.meta.env.VITE_DATA_PROVIDER === 'supabase');
              if (isSupabase && !isUuid(String(activeProjectId))) {
                throw new Error('Invalid project id for Supabase mode');
              }
            } catch (e) {
              throw e;
            }
            storageService.removeSource(activeProjectId, id);
        }
    } catch {}
    setSources(prev => prev.filter(s => s.id !== id));

    if (toRemove) {
      setSourceHistory(prev => [
        {
          id: `hist-${toRemove.id}-${Date.now()}`,
          timestamp: Date.now(),
          type: 'removed',
          sourceTitle: toRemove.title,
          contentType: toRemove.mimeType || toRemove.type,
          size: estimateContentBytes(toRemove),
        },
        ...prev,
      ]);
    }
  };

  const handleSaveLiveTranscript = (transcript: string) => {
      if (!transcript.trim()) return;
      const title = `Transcripción_Live_${new Date().toLocaleTimeString('es-ES').replace(/:/g, '-')}.txt`;
      addSource({
          id: Date.now().toString(),
          title: title,
          content: transcript,
          type: 'text',
          mimeType: 'text/plain'
      });
  };

  const handleSaveApiKey = (key: string) => {
      setStoredApiKey(key);
      setShowApiKeyModal(false);
  };

  const getSystemContext = () => {
    if (sources.length === 0) return "No hay fuentes.";
    return `Fuentes disponibles: \n${sources.map(s => {
        const contentToUse = s.extractedText || s.content;
        const preview = contentToUse.substring(0, 5000); 
        return `TÍTULO: ${s.title}\nCONTENIDO: ${preview}...`;
    }).join('\n\n')}`;
  };

  let enableVoiceAuth = false;
  try {
      // @ts-ignore
      enableVoiceAuth = !!(import.meta && import.meta.env && import.meta.env.VITE_ENABLE_VOICE_AUTH === 'true');
  } catch {}

  // Gate 1: Supabase Auth session (required for Cloud Mode)
  if (supabase && !hasSupabaseSession) {
      return (
          <>
            <LoginScreen 
                stage="supabase" 
                onAuthed={() => {
                    setHasSupabaseSession(true);
                }}
                onOpenSettings={() => setShowApiKeyModal(true)} 
            />
            <ApiKeyModal 
                isOpen={showApiKeyModal} 
                onClose={() => setShowApiKeyModal(false)}
                onSave={handleSaveApiKey}
                hasSystemKey={!!getSystemApiKey()}
            />
          </>
      );
  }

  // ... [Render Return remains mostly identical, passing the handlers] ...
  return (
    <div className="flex h-[100dvh] w-full bg-[#050505] overflow-hidden">
      <div 
        className={`fixed inset-0 bg-black/80 z-40 md:hidden transition-opacity duration-300 backdrop-blur-sm ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      <div className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 md:flex-shrink-0`}>
        <Sidebar 
          user={user}
          projects={projects}
          activeProjectId={activeProjectId}
          sources={sources} 
          history={sourceHistory}
          isMirrorMode={isMirrorMode}
          onAddSource={addSource} 
          onRemoveSource={removeSource} 
          onSwitchProject={handleSwitchProject}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onClearChat={handleClearChat}
          onToggleMirror={() => setIsMirrorMode(!isMirrorMode)}
          onMobileClose={() => setIsSidebarOpen(false)}
          onOpenSettings={() => setShowApiKeyModal(true)}
          onOpenVoiceAuth={() => {
            if (!enableVoiceAuth) {
              alert('Voice Auth está desactivado. Configura VITE_ENABLE_VOICE_AUTH=true');
              return;
            }
            setShowVoiceAuthModal(true);
          }}
          onLogout={handleLogout}
          onUpdateUser={handleUpdateUser}
        />
      </div>

      <main className={`flex-1 flex relative h-full w-full min-w-0 ${isMirrorMode ? 'flex-col md:flex-row' : 'flex-col'}`}>
        {activeProjectId ? (
            <>
                <div className={`flex-1 flex flex-col min-w-0 h-full ${isMirrorMode ? 'border-b md:border-b-0 md:border-r border-neutral-800' : ''} min-h-0`}>
                    <ChatArea 
                        key={`${activeProjectId}-primary`} 
                        chatHistory={chatHistory} 
                        setChatHistory={setChatHistory} 
                        sources={sources}
                        onAddSource={addSource}
                        onOpenLive={() => setIsLiveOpen(true)}
                        onToggleSidebar={() => setIsSidebarOpen(true)}
                    />
                </div>
                {isMirrorMode && (
                    <div className="flex-1 flex flex-col min-w-0 h-full bg-black/50 min-h-0">
                        <ChatArea 
                            key={`${activeProjectId}-mirror`} 
                            chatHistory={chatHistory} 
                            setChatHistory={setChatHistory} 
                            sources={sources}
                            onAddSource={addSource}
                            onOpenLive={() => setIsLiveOpen(true)}
                            onToggleSidebar={() => setIsSidebarOpen(true)}
                        />
                    </div>
                )}
            </>
        ) : (
            <div className="flex-1 flex flex-col">
                 <div className="md:hidden h-14 border-b border-neutral-800 flex items-center px-4 bg-black/50 backdrop-blur-sm sticky top-0 z-30">
                      <button onClick={() => setIsSidebarOpen(true)} className="text-neutral-400 hover:text-white">
                          <Menu size={20} />
                      </button>
                      <div className="ml-4 flex items-center gap-2">
                        <img
                          src="/molielm-logo.png"
                          alt="MolieLM"
                          className="h-6 w-6 object-contain"
                        />
                        <span className="text-xs font-bold text-neutral-500 tracking-widest">MOLIE_LM</span>
                      </div>
                      <div className="ml-auto">
                        <a
                          href="https://hgihub.cloud"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 hover:text-white transition-colors"
                        >
                          HGIHUB.CLOUD
                        </a>
                      </div>
                 </div>
                 <div className="flex-1 flex items-center justify-center">
                    <p className="text-neutral-500 font-mono tracking-widest">SELECCIONE_PROYECTO</p>
                </div>
            </div>
        )}
      </main>
      
      <LiveAudio 
        isOpen={isLiveOpen} 
        onClose={() => setIsLiveOpen(false)} 
        systemContext={getSystemContext()}
        onSaveTranscript={handleSaveLiveTranscript}
      />
      
      <ApiKeyModal 
          isOpen={showApiKeyModal} 
          onClose={() => setShowApiKeyModal(false)}
          onSave={handleSaveApiKey}
          hasSystemKey={!!getSystemApiKey()}
      />

      <VoiceAuthModal
          isOpen={showVoiceAuthModal}
          onClose={() => setShowVoiceAuthModal(false)}
      />
    </div>
  );
};

export default App;