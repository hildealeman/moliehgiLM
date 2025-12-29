import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import LiveAudio from './components/LiveAudio';
import ApiKeyModal from './components/ApiKeyModal';
import LoginScreen from './components/LoginScreen';
import { Source, ChatMessage, SourceHistoryItem, Project, UserProfile } from './types';
import { storageService } from './src/services/storageService';
import { getEffectiveApiKey, getSystemApiKey, setStoredApiKey, extractTextFromMultimodal } from './src/services/geminiService';
import { supabase } from './src/lib/supabase/client';
import { Menu } from 'lucide-react';

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

  const autoSaveRef = useRef({ sources, chatHistory, sourceHistory, activeProjectId, projects });

  useEffect(() => {
    autoSaveRef.current = { sources, chatHistory, sourceHistory, activeProjectId, projects };
  }, [sources, chatHistory, sourceHistory, activeProjectId, projects]);

  // Initial Load - Now Async
  useEffect(() => {
    const loadData = async () => {
        // Track Supabase session state (required for Cloud mode with RLS)
        if (supabase) {
            const { data } = await supabase.auth.getSession();
            setHasSupabaseSession(!!data.session);
            const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
                setHasSupabaseSession(!!session);
            });
            // Avoid leaking listener
            // @ts-ignore
            (loadData as any)._unsub = sub?.subscription;
        }

        const loadedProjects = await storageService.getProjects();
        setProjects(loadedProjects);
        
        if (loadedProjects.length > 0) {
          loadProject(loadedProjects[0]);
        } else {
            // If no projects, check if we need to create default (Mock only)
            // Use safe check for environment var
            let isSupabase = false;
            try {
               // @ts-ignore
               isSupabase = (import.meta && import.meta.env && import.meta.env.VITE_DATA_PROVIDER === 'supabase');
            } catch(e) {}

            if (!isSupabase) {
                const defaultProject = storageService.createProject("PROYECTO_ALPHA_01");
                setProjects([defaultProject]);
                loadProject(defaultProject);
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

  const loadProject = (project: Project) => {
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
    setSources(prev => [...prev, source]);

    const summaryId = `source-summary-${source.id}`;
    const immediateText = source.type === 'text' ? (source.content || "") : (source.extractedText || "");
    const isPreliminary = source.type !== 'text' && !source.extractedText;
    const summary = buildAutoSummaryMarkdown(source, immediateText, isPreliminary);
    upsertChatMessage({
        id: summaryId,
        role: 'model',
        text: summary,
    });
    
    // ... [Calculations for History Item] ...
    // Note: In Cloud mode, we might want to upload first, but for optimistic UI we update state immediately
    // Ideally, storageService.addSource handles the upload async

    // Trigger background text extraction
    if (source.type !== 'text' && !source.extractedText) {
        extractTextFromMultimodal(source).then(extracted => {
            if (extracted) {
                setSources(prev => prev.map(s => s.id === source.id ? { ...s, extractedText: extracted } : s));

                const finalSummary = buildAutoSummaryMarkdown(source, extracted, false);
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
    setSources(prev => prev.filter(s => s.id !== id));
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
                      <span className="ml-4 text-xs font-bold text-neutral-500 tracking-widest">MOLIE_LM</span>
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
    </div>
  );
};

export default App;