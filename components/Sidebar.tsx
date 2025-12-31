import React, { useState } from 'react';
import { Plus, FileText, Image as ImageIcon, Trash2, History, ArrowLeft, Clock, Database, Cloud, FolderPlus, Folder, ChevronDown, User, LogOut, Loader2, Zap, X, Minimize2, Download, MessageSquareOff, Columns, Settings, Server, Globe, Box, Edit2, Phone, Mail, Briefcase, BadgeCheck } from 'lucide-react';
import { Source, SourceHistoryItem, Project, UserProfile } from '../types';
import { dbService } from '../services/dbService';

interface SidebarProps {
  user: UserProfile;
  projects: Project[];
  activeProjectId: string | null;
  sources: Source[];
  history: SourceHistoryItem[];
  isMirrorMode: boolean;
  onAddSource: (source: Source) => void;
  onRemoveSource: (id: string) => void;
  onSwitchProject: (projectId: string) => void;
  onCreateProject: (name: string, cloneSourceId?: string) => void;
  onDeleteProject: (id: string) => void;
  onClearChat: () => void;
  onToggleMirror: () => void;
  onMobileClose?: () => void;
  onOpenSettings: () => void;
  onOpenVoiceAuth: () => void;
  onLogout: () => void;
  onUpdateUser: (user: UserProfile) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  user, 
  projects, 
  activeProjectId, 
  sources, 
  history,
  isMirrorMode,
  onAddSource, 
  onRemoveSource,
  onSwitchProject,
  onCreateProject,
  onDeleteProject,
  onClearChat,
  onToggleMirror,
  onMobileClose,
  onOpenSettings,
  onOpenVoiceAuth,
  onLogout,
  onUpdateUser
}) => {
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [tempText, setTempText] = useState("");
  const [tempUrl, setTempUrl] = useState("");
  
  // Project Management UI State
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [cloneSourceId, setCloneSourceId] = useState<string>("");

  // Content Viewer Modal State
  const [viewingSource, setViewingSource] = useState<Source | null>(null);

  // Profile Modal State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<UserProfile>(user);

  // Connectors State
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // DB Connection Form State
  const [dbMode, setDbMode] = useState<'mock' | 'supabase' | 'api'>('mock');
  const [supaUrl, setSupaUrl] = useState("");
  const [supaKey, setSupaKey] = useState("");
  const [supaTable, setSupaTable] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [connError, setConnError] = useState<string | null>(null);

  const [supaTables, setSupaTables] = useState<Array<{ name: string; columns: string[] }>>([]);
  const [isLoadingSupaTables, setIsLoadingSupaTables] = useState(false);

  const activeProject = projects.find(p => p.id === activeProjectId);

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName, cloneSourceId || undefined);
    setNewProjectName("");
    setCloneSourceId("");
    setIsCreatingProject(false);
    setShowProjectMenu(false);
  };

  const readFileAsSource = (file: File, index: number) => {
    return new Promise<Source>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.onload = (ev) => {
        const result = ev.target?.result as string;

        let type: 'text' | 'file' | 'image' = 'file';
        let mimeType = file.type;

        if (file.type.startsWith('image/')) {
          type = 'image';
        } else if (file.type === 'application/pdf') {
          type = 'file';
        } else if (file.type.includes('text') || file.name.endsWith('.md') || file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.json')) {
          type = 'text';
          mimeType = file.type || 'text/plain';
        }

        resolve({
          id: `${Date.now()}-${index}`,
          title: file.name,
          content: result,
          type,
          mimeType,
        });
      };

      if (file.type.startsWith('image/') || file.type === 'application/pdf' || !file.type || !file.type.includes('text')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    try {
      const sourcesToAdd = await Promise.all(files.map((f, i) => readFileAsSource(f, i)));
      for (const s of sourcesToAdd) onAddSource(s);
    } finally {
      // allow selecting the same file again
      e.target.value = '';
    }
  };

  const handleAddText = () => {
    if (!tempText.trim()) return;
    onAddSource({
        id: Date.now().toString(),
        title: `Nota_Rapida_${sources.length + 1}`,
        content: tempText,
        type: 'text',
        mimeType: 'text/plain'
    });
    setTempText("");
    setIsAddingSource(false);
  };

  const handleAddUrl = () => {
    const raw = tempUrl.trim();
    if (!raw) return;
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    let title = url;
    try {
      title = new URL(url).hostname;
    } catch {}

    onAddSource({
      id: Date.now().toString(),
      title: `URL_${title}`,
      content: url,
      type: 'text',
      mimeType: 'text/url',
    });
    setTempUrl('');
  };

  const handleConnectDrive = () => {
    setIsConnecting(true);
    setTimeout(() => {
        onAddSource({
            id: Date.now().toString(),
            title: "Demo_Google_Doc.pdf",
            content: "data:application/pdf;base64,JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXwKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSC4gIC9SZXNvdXJjZXMgPDwKICAgIC9Gb250IDw8CiAgICAgIC9FMSA0IDAgUgogICAgPj4KICA+PgogIC9Db250ZW50cyA1IDAgUgo+PgplbmRvYmoKCjQgMCBvYmoKPDwKICAvVHlwZSAvRm9udAogIC9TdWJ0eXBlIC9UeXBlMQogIC9CYXNlRm9udCAvSGVsdmV0aWNhCj4+CmVuZG9iagoKNSAwIG9iago8PAogIC9MZW5ndGggNDQKPj4Kc3RyZWFtCkJUCjcwIDUwIFRECi9FMSAxMiBUZgooSGVsbG8sIFdvcmxkISkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDE1NyAwMDAwMCBuIAowMDAwMDAwMjU1IDAwMDAwIG4gCjAwMDAwMDAzNDIgMDAwMDAgbiAKdHJhaWxlcgo8PAogIC9TaXplIDYKICAvUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKNDM2CiUlRU9GCg==", 
            type: 'file',
            mimeType: 'application/pdf'
        });
        setIsConnecting(false);
        setIsDriveModalOpen(false);
    }, 1500);
  };

  const executeDbConnection = async () => {
      setConnError(null);
      setIsConnecting(true);
      
      try {
          let content = "";
          let title = "";

          if (dbMode === 'mock') {
              content = await dbService.fetchMockData();
              title = "DB_CLIENTES_SIMULATION";
          } else if (dbMode === 'supabase') {
              if (!supaUrl || !supaKey || !supaTable) throw new Error("Faltan datos de configuración Supabase");
              content = await dbService.fetchSupabaseData(supaUrl, supaKey, supaTable);
              title = `SUPABASE_${supaTable.toUpperCase()}`;
          } else if (dbMode === 'api') {
              if (!apiUrl) throw new Error("Falta la URL del API");
              content = await dbService.fetchApiData(apiUrl, apiToken);
              title = `API_DATA_${new URL(apiUrl).hostname}`;
          }

          onAddSource({
              id: Date.now().toString(),
              title: title,
              content: content,
              type: 'text',
              mimeType: 'text/csv'
          });

          setIsSqlModalOpen(false);
      } catch (e: any) {
          setConnError(e.message);
      } finally {
          setIsConnecting(false);
      }
  };

  const loadSupabaseTables = async () => {
    setConnError(null);
    setIsLoadingSupaTables(true);
    try {
      if (!supaUrl || !supaKey) throw new Error('Ingresa Project URL y Anon Key');
      const list = await dbService.listSupabaseTables(supaUrl, supaKey);
      setSupaTables(list);
      if (!supaTable && list.length > 0) setSupaTable(list[0].name);
      if (list.length === 0) {
        setConnError('No se detectaron tablas accesibles con esa key. Revisa RLS/permisos o el schema expuesto por PostgREST.');
      }
    } catch (e: any) {
      setConnError(e.message);
      setSupaTables([]);
    } finally {
      setIsLoadingSupaTables(false);
    }
  };

  const handleRemoveAndClose = () => {
    if (viewingSource) {
      onRemoveSource(viewingSource.id);
      setViewingSource(null);
    }
  };

  const handleProfileSave = (e: React.FormEvent) => {
      e.preventDefault();
      onUpdateUser(editProfile);
      setIsProfileOpen(false);
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-full h-full bg-black/95 backdrop-blur-xl border-r border-neutral-800 flex flex-col relative z-20 font-mono">
      <div className="p-6 pb-4 flex items-center justify-between">
        <div>
            <div className="flex items-center gap-3">
              <img
                src="/molielm-logo.png"
                alt="MolieLM"
                className="h-10 w-10 object-contain"
              />
              <h1 className="text-2xl font-bold text-white tracking-tight leading-none">
                MolieLM
              </h1>
            </div>
            <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] mt-2">Human Grounded Intelligence</p>
            <a
              href="https://hgihub.cloud"
              target="_blank"
              rel="noreferrer"
              className="inline-flex mt-3 text-[10px] uppercase tracking-[0.2em] text-neutral-400 hover:text-white transition-colors"
            >
              BACK_TO_HGIHUB.CLOUD
            </a>
        </div>
        {/* Mobile Close Button */}
        <button 
            onClick={onMobileClose} 
            className="md:hidden text-neutral-500 hover:text-white p-3 hover:bg-neutral-800 rounded-full transition-colors"
        >
            <X size={24} />
        </button>
      </div>

      {/* Project Selector */}
      <div className="px-4 mb-6 relative">
        <button 
            onClick={() => setShowProjectMenu(!showProjectMenu)}
            className="w-full flex items-center justify-between p-3 bg-neutral-900 border border-neutral-800 hover:border-orange-500/50 transition-colors group"
        >
            <div className="flex items-center gap-3 overflow-hidden">
                <div className="p-1 bg-neutral-800 group-hover:bg-orange-500/20 text-neutral-400 group-hover:text-orange-500 transition-colors">
                    <Folder size={14} />
                </div>
                <span className="text-xs font-bold text-neutral-300 truncate tracking-wide">
                    {activeProject ? activeProject.name : "SELECCIONE_PROYECTO"}
                </span>
            </div>
            <ChevronDown size={14} className={`text-neutral-500 transition-transform ${showProjectMenu ? 'rotate-180' : ''}`} />
        </button>

        {showProjectMenu && (
            <div className="absolute top-full left-4 right-4 mt-2 bg-neutral-900 border border-neutral-800 shadow-2xl z-50 animate-fade-in-up">
                <div className="max-h-60 overflow-y-auto">
                    {projects.map(p => (
                        <div key={p.id} className="group flex items-center justify-between px-3 py-4 hover:bg-neutral-800 cursor-pointer border-b border-neutral-800 last:border-0 transition-colors">
                             <button 
                                onClick={() => { onSwitchProject(p.id); setShowProjectMenu(false); }}
                                className={`flex-1 text-left text-xs tracking-wide ${p.id === activeProjectId ? 'text-orange-500 font-bold' : 'text-neutral-400'}`}
                             >
                                {p.name}
                             </button>
                             {projects.length > 1 && p.id !== activeProjectId && (
                                 <button 
                                    onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id); }}
                                    className="text-neutral-600 hover:text-red-500 p-2 -mr-2"
                                 >
                                     <Trash2 size={14} />
                                 </button>
                             )}
                        </div>
                    ))}
                </div>
                <div className="border-t border-neutral-800 p-2 bg-neutral-950 space-y-1">
                    {!isCreatingProject ? (
                        <>
                            <button 
                                onClick={() => { onClearChat(); setShowProjectMenu(false); }}
                                className="w-full flex items-center justify-center gap-2 text-[10px] font-bold text-neutral-400 hover:text-white uppercase tracking-wider py-3 hover:bg-neutral-900 transition-colors"
                            >
                                <MessageSquareOff size={14} /> Limpiar Chat
                            </button>
                            {activeProjectId && projects.length > 0 && (
                              <button
                                onClick={() => {
                                  const ok = window.confirm('¿Borrar este proyecto? Esto eliminará fuentes y chat.');
                                  if (!ok) return;
                                  onDeleteProject(activeProjectId);
                                  setShowProjectMenu(false);
                                }}
                                className="w-full flex items-center justify-center gap-2 text-[10px] font-bold text-red-400 hover:text-red-300 uppercase tracking-wider py-3 hover:bg-red-900/10 transition-colors"
                              >
                                <Trash2 size={14} /> Borrar Proyecto
                              </button>
                            )}
                            <button 
                                onClick={() => setIsCreatingProject(true)}
                                className="w-full flex items-center justify-center gap-2 text-[10px] font-bold text-orange-500 hover:text-orange-400 uppercase tracking-wider py-3 hover:bg-neutral-900 transition-colors"
                            >
                                <FolderPlus size={14} /> Nuevo Proyecto
                            </button>
                        </>
                    ) : (
                        <div className="space-y-2 p-2">
                            <input 
                                autoFocus
                                className="w-full bg-neutral-900 text-white text-xs p-2 border border-neutral-700 focus:border-orange-500 outline-none placeholder-neutral-600"
                                placeholder="NOMBRE_PROYECTO..."
                                value={newProjectName}
                                onChange={e => setNewProjectName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                            />
                            
                            <select 
                                className="w-full bg-neutral-900 text-white text-[10px] p-2 border border-neutral-700 focus:border-orange-500 outline-none mb-2 font-mono"
                                value={cloneSourceId}
                                onChange={e => setCloneSourceId(e.target.value)}
                            >
                                <option value="">[PLANTILLA: VACÍO]</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>CLONAR: {p.name}</option>
                                ))}
                            </select>

                            <div className="flex justify-end gap-2">
                                <button onClick={() => { setIsCreatingProject(false); setCloneSourceId(""); }} className="text-[10px] text-neutral-500 hover:text-white uppercase px-2 py-1">Cancelar</button>
                                <button onClick={handleCreateProject} className="text-[10px] bg-orange-600 text-white px-3 py-1 hover:bg-orange-700 uppercase font-bold">Crear</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 overflow-y-auto px-4 pb-4 space-y-4 ${!activeProjectId ? 'opacity-30 pointer-events-none' : ''}`}>
        
        {/* Toggle Header */}
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-800">
            <h2 className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2">
                {showHistory ? (
                    <>
                        <Clock size={12} /> Timeline
                    </>
                ) : (
                    <>
                        <FileText size={12} /> Fuentes de Datos
                    </>
                )}
            </h2>
            <button 
                onClick={() => setShowHistory(!showHistory)}
                className="text-neutral-600 hover:text-orange-500 p-2 -mr-2 transition-colors"
                title={showHistory ? "Ver Fuentes" : "Ver Historial"}
            >
                {showHistory ? <ArrowLeft size={14} /> : <History size={14} />}
            </button>
        </div>

        {/* View: Source List */}
        {!showHistory && (
            <>
                {sources.length === 0 && (
                    <div className="text-center py-12 border border-dashed border-neutral-800">
                        <p className="text-neutral-600 text-[10px] uppercase tracking-widest">Sin datos ingeridos</p>
                    </div>
                )}
                
                {sources.map(src => (
                <div 
                    key={src.id} 
                    className="group relative bg-neutral-900/50 hover:bg-neutral-900 p-3 border border-neutral-800 hover:border-orange-500/30 transition-all cursor-pointer"
                    onClick={() => setViewingSource(src)}
                >
                    <button 
                        onClick={(e) => { e.stopPropagation(); onRemoveSource(src.id); }}
                        className="absolute top-2 right-2 text-neutral-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10 p-2"
                    >
                        <Trash2 size={14} />
                    </button>
                    <div className="flex items-start gap-3">
                        <div className={`mt-1 p-1.5 ${
                            src.mimeType === 'application/pdf' ? 'text-red-500' :
                            src.type === 'image' ? 'text-purple-500' : 
                            src.title.includes('DB') ? 'text-green-500' :
                            src.title.includes('API') ? 'text-blue-500' :
                            'text-orange-500'
                        }`}>
                            {src.mimeType === 'application/pdf' ? <FileText size={16} /> :
                             src.type === 'image' ? <ImageIcon size={16} /> : 
                             src.title.includes('DB') ? <Database size={16} /> :
                             src.title.includes('API') ? <Globe size={16} /> :
                             <FileText size={16} />}
                        </div>
                        <div className="flex-1 min-w-0 pr-6">
                            <h3 className="text-xs font-bold text-neutral-200 truncate font-sans tracking-wide group-hover:text-orange-500 transition-colors" title={src.title}>{src.title}</h3>
                            <p className="text-[10px] text-neutral-500 mt-1 truncate font-mono">
                                {src.type === 'image' ? 'IMG_BINARY' : 
                                 src.mimeType === 'application/pdf' ? 'PDF_DOC' :
                                 src.title.includes('DB') ? 'SQL_CONN' :
                                 src.title.includes('API') ? 'JSON_STREAM' :
                                 'TEXT_STREAM'}
                            </p>
                        </div>
                    </div>
                </div>
                ))}

                <div className="pt-6 border-t border-neutral-800 space-y-3">
                    <h3 className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest mb-2">Conectores</h3>
                    
                    {/* External Connectors */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                         <button 
                            onClick={() => setIsDriveModalOpen(true)}
                            className="flex flex-col items-center justify-center p-3 border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 hover:border-blue-500/50 transition-all group"
                         >
                             <Cloud size={18} className="text-neutral-500 group-hover:text-blue-500 mb-2" />
                             <span className="text-[10px] font-bold text-neutral-400">G_DRIVE</span>
                         </button>
                         <button 
                             onClick={() => setIsSqlModalOpen(true)}
                             className="flex flex-col items-center justify-center p-3 border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 hover:border-green-500/50 transition-all group"
                         >
                             <Database size={18} className="text-neutral-500 group-hover:text-green-500 mb-2" />
                             <span className="text-[10px] font-bold text-neutral-400">DATABASE</span>
                         </button>
                    </div>

                    {!isAddingSource ? (
                        <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col items-center justify-center p-4 border border-dashed border-neutral-700 hover:border-orange-500 hover:bg-orange-500/5 cursor-pointer transition-all group">
                                <Plus size={20} className="text-neutral-500 group-hover:text-orange-500 mb-2" />
                                <span className="text-[10px] font-bold text-neutral-400 group-hover:text-orange-500">UPLOAD</span>
                                <input type="file" multiple className="hidden" onChange={handleFileUpload} accept=".txt,.md,.csv,.pdf,.json,image/*" />
                            </label>
                            <button 
                                onClick={() => setIsAddingSource(true)}
                                className="flex flex-col items-center justify-center p-4 border border-dashed border-neutral-700 hover:border-orange-500 hover:bg-orange-500/5 cursor-pointer transition-all group"
                            >
                                <FileText size={20} className="text-neutral-500 group-hover:text-orange-500 mb-2" />
                                <span className="text-[10px] font-bold text-neutral-400 group-hover:text-orange-500">PASTE</span>
                            </button>
                        </div>
                    ) : (
                        <div className="bg-neutral-900 p-3 border border-orange-500/30 animate-fade-in-up">
                            <textarea 
                                    className="w-full bg-black text-xs p-2 border border-neutral-700 focus:border-orange-500 outline-none text-neutral-300 font-mono mb-2"
                                    rows={3}
                                    placeholder="Input stream..."
                                    value={tempText}
                                    onChange={(e) => setTempText(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setIsAddingSource(false)} className="text-[10px] text-neutral-500 hover:text-white uppercase px-2 py-1">Cancel</button>
                                <button onClick={handleAddText} className="text-[10px] bg-orange-600 text-white px-2 py-1 hover:bg-orange-700 uppercase">Add</button>
                            </div>
                        </div>
                    )}

                    <div className="bg-neutral-950 border border-neutral-800 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">URL</h4>
                        <Globe size={14} className="text-neutral-600" />
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={tempUrl}
                          onChange={(e) => setTempUrl(e.target.value)}
                          placeholder="https://ejemplo.com/articulo"
                          className="flex-1 bg-black border border-neutral-800 px-2 py-2 text-xs text-neutral-200 outline-none focus:border-orange-500"
                        />
                        <button
                          onClick={handleAddUrl}
                          disabled={!tempUrl.trim()}
                          className="px-3 py-2 text-[10px] uppercase font-bold tracking-widest bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] text-neutral-600">
                        La IA hará crawl de la URL (vía servidor) al usarla como fuente.
                      </p>
                    </div>
                </div>
            </>
        )}

        {/* View: History Log */}
        {showHistory && (
             <div className="space-y-2">
                {history.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-2 border-l border-neutral-800 ml-2">
                        <div className={`w-1.5 h-1.5 ${item.type === 'added' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-neutral-300 truncate font-mono">{item.sourceTitle}</p>
                            <div className="flex justify-between items-center mt-1">
                                <span className={`text-[9px] uppercase tracking-wider ${item.type === 'added' ? 'text-green-700' : 'text-red-700'}`}>
                                    {item.type === 'added' ? 'INGESTED' : 'PURGED'}
                                </span>
                                <div className="flex items-center gap-2 text-[9px] text-neutral-600 font-mono">
                                    {item.contentType && <span className="text-neutral-500">[{item.contentType}]</span>}
                                    {item.size && <span className="text-neutral-500">{formatBytes(item.size)}</span>}
                                    <span>{formatTime(item.timestamp)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
             </div>
        )}

      </div>

      {/* User Profile Footer */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-950 space-y-3">
          {/* Controls */}
          <div className="flex items-center justify-between">
              <button 
                onClick={onToggleMirror}
                className={`p-2 rounded transition-colors ${isMirrorMode ? 'bg-orange-500/20 text-orange-500' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'}`}
                title="Modo Espejo (Split View)"
              >
                  <Columns size={16} />
              </button>
              <button 
                  onClick={onOpenVoiceAuth}
                  className="p-2 rounded transition-colors text-neutral-500 hover:text-white hover:bg-neutral-800"
                  title="Voice Auth"
              >
                  <Phone size={16} />
              </button>
              <button 
                  onClick={onOpenSettings}
                  className="p-2 rounded transition-colors text-neutral-500 hover:text-white hover:bg-neutral-800"
                  title="Configuración API Key"
              >
                  <Settings size={16} />
              </button>
              <div className="text-[9px] text-neutral-600 uppercase tracking-widest font-mono">
                  v2.0.1
              </div>
          </div>

          <div className="flex items-center gap-3 cursor-pointer p-2 hover:bg-neutral-900 rounded transition-colors group" onClick={() => { setEditProfile(user); setIsProfileOpen(true); }}>
              <div className="w-8 h-8 bg-neutral-800 flex items-center justify-center overflow-hidden border border-neutral-700 group-hover:border-orange-500/50">
                  {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover grayscale group-hover:grayscale-0" />
                  ) : (
                      <User size={14} className="text-neutral-400" />
                  )}
              </div>
              <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-neutral-300 truncate group-hover:text-white">{user.name}</p>
                  <p className="text-[10px] text-neutral-600 truncate font-mono">{user.email}</p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); onLogout(); }} 
                className="text-neutral-600 hover:text-red-500 transition-colors p-2"
                title="Cerrar Sesión"
              >
                  <LogOut size={14} />
              </button>
          </div>
      </div>
      
      {/* DRIVE Connector Modal (Mock) */}
      {isDriveModalOpen && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-neutral-900 border border-neutral-800 p-6 w-full max-w-sm">
                  <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2 uppercase tracking-wide">
                      <Cloud size={16} className="text-blue-500" /> Link G_Drive
                  </h3>
                  <p className="text-xs text-neutral-500 mb-6 font-mono">
                      Establishing secure connection to Google Workspace...
                  </p>
                  
                  {isConnecting ? (
                      <div className="flex flex-col items-center justify-center py-4 space-y-3">
                          <Loader2 className="animate-spin text-orange-500" size={24} />
                          <span className="text-[10px] font-bold text-orange-500 uppercase blink">Downloading...</span>
                      </div>
                  ) : (
                      <div className="flex gap-2 justify-end">
                              <button onClick={() => setIsDriveModalOpen(false)} className="px-3 py-1 text-[10px] font-bold text-neutral-500 hover:text-white uppercase">Abort</button>
                              <button onClick={handleConnectDrive} className="px-3 py-1 text-[10px] font-bold text-black uppercase bg-blue-500 hover:bg-blue-400">Connect</button>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* SQL/DB Connector Modal (Real) */}
      {isSqlModalOpen && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <div className="bg-neutral-900 border border-neutral-800 w-full max-w-sm flex flex-col shadow-2xl">
                  
                  {/* Header */}
                  <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
                       <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                           <Database size={14} className="text-green-500" /> Connector Config
                       </h3>
                       <button onClick={() => setIsSqlModalOpen(false)} className="text-neutral-500 hover:text-white"><X size={16}/></button>
                  </div>

                  {/* Body */}
                  <div className="p-4 space-y-4">
                      {connError && (
                          <div className="bg-red-900/20 p-2 text-[10px] text-red-300 border border-red-900 flex gap-2">
                              <span className="font-bold">ERROR:</span> {connError}
                          </div>
                      )}

                      {/* Mode Switcher */}
                      <div className="flex bg-neutral-950 p-1 rounded border border-neutral-800">
                          <button onClick={() => setDbMode('mock')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase transition-colors ${dbMode === 'mock' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}>Sim</button>
                          <button onClick={() => setDbMode('supabase')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase transition-colors ${dbMode === 'supabase' ? 'bg-green-900/30 text-green-400' : 'text-neutral-500'}`}>Supabase</button>
                          <button onClick={() => setDbMode('api')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase transition-colors ${dbMode === 'api' ? 'bg-blue-900/30 text-blue-400' : 'text-neutral-500'}`}>API</button>
                      </div>

                      {/* Forms */}
                      <div className="space-y-3">
                          {dbMode === 'mock' && (
                              <div className="p-3 bg-neutral-800/30 border border-neutral-800">
                                  <p className="text-[10px] text-neutral-400 mb-2">Simulates a connection to a generic SQL database. Useful for demos.</p>
                                  <div className="flex items-center gap-2 text-neutral-600 text-[10px] font-mono">
                                      <Box size={12} /> <span>Dataset: CLIENTES_PROD.csv</span>
                                  </div>
                              </div>
                          )}

                          {dbMode === 'supabase' && (
                              <>
                                  <div className="space-y-1">
                                      <label className="text-[10px] text-neutral-500 uppercase font-bold">Project URL</label>
                                      <input value={supaUrl} onChange={e => { setSupaUrl(e.target.value); setSupaTables([]); }} placeholder="https://xyz.supabase.co" className="w-full bg-black border border-neutral-700 p-2 text-xs text-green-400 focus:border-green-500 outline-none font-mono" />
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[10px] text-neutral-500 uppercase font-bold">Anon Key</label>
                                      <input value={supaKey} onChange={e => { setSupaKey(e.target.value); setSupaTables([]); }} type="password" placeholder="eyJh..." className="w-full bg-black border border-neutral-700 p-2 text-xs text-green-400 focus:border-green-500 outline-none font-mono" />
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <button
                                      onClick={loadSupabaseTables}
                                      disabled={!supaUrl || !supaKey || isLoadingSupaTables}
                                      className="text-[10px] uppercase font-bold tracking-widest px-3 py-2 border border-neutral-800 bg-neutral-950 text-green-400 disabled:opacity-50 disabled:cursor-not-allowed hover:border-green-500"
                                    >
                                      {isLoadingSupaTables ? 'Cargando tablas...' : 'Cargar tablas'}
                                    </button>
                                    <span className="text-[10px] text-neutral-600">
                                      {supaTables.length > 0 ? `${supaTables.length} tablas` : '—'}
                                    </span>
                                  </div>

                                  <div className="space-y-1">
                                      <label className="text-[10px] text-neutral-500 uppercase font-bold">Table Name</label>
                                      {supaTables.length > 0 ? (
                                        <select
                                          value={supaTable}
                                          onChange={(e) => setSupaTable(e.target.value)}
                                          className="w-full bg-black border border-neutral-700 p-2 text-xs text-green-400 focus:border-green-500 outline-none font-mono"
                                        >
                                          {supaTables.map((t) => (
                                            <option key={t.name} value={t.name}>{t.name}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input value={supaTable} onChange={e => setSupaTable(e.target.value)} placeholder="customers" className="w-full bg-black border border-neutral-700 p-2 text-xs text-green-400 focus:border-green-500 outline-none font-mono" />
                                      )}
                                  </div>

                                  {supaTables.length > 0 && supaTable && (
                                    <div className="bg-neutral-950 border border-neutral-800 p-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">COLUMNAS</span>
                                        <span className="text-[10px] text-neutral-600">RLS puede ocultar filas</span>
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {(supaTables.find(t => t.name === supaTable)?.columns || []).slice(0, 24).map((c) => (
                                          <span key={c} className="text-[9px] px-1.5 py-0.5 border border-neutral-800 bg-black text-neutral-300 font-mono">{c}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                              </>
                          )}

                          {dbMode === 'api' && (
                              <>
                                  <div className="space-y-1">
                                      <label className="text-[10px] text-neutral-500 uppercase font-bold">API Endpoint (JSON)</label>
                                      <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://api.mysite.com/v1/data" className="w-full bg-black border border-neutral-700 p-2 text-xs text-blue-400 focus:border-blue-500 outline-none font-mono" />
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[10px] text-neutral-500 uppercase font-bold">Bearer Token (Opt)</label>
                                      <input value={apiToken} onChange={e => setApiToken(e.target.value)} type="password" placeholder="ey..." className="w-full bg-black border border-neutral-700 p-2 text-xs text-blue-400 focus:border-blue-500 outline-none font-mono" />
                                  </div>
                              </>
                          )}
                      </div>
                  </div>

                  {/* Footer */}
                  <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex justify-end">
                      {isConnecting ? (
                          <div className="flex items-center gap-2 text-orange-500 text-[10px] uppercase font-bold">
                              <Loader2 className="animate-spin" size={14} /> Handshaking...
                          </div>
                      ) : (
                          <button 
                              onClick={executeDbConnection}
                              className={`px-4 py-2 text-[10px] font-bold text-black uppercase tracking-wider flex items-center gap-2 ${dbMode === 'supabase' ? 'bg-green-500 hover:bg-green-400' : dbMode === 'api' ? 'bg-blue-500 hover:bg-blue-400' : 'bg-neutral-200 hover:bg-white'}`}
                          >
                              {dbMode === 'mock' ? 'Inject Data' : 'Connect & Fetch'} <Zap size={12} fill="black" />
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}
      
      {/* Profile Edit Modal */}
      {isProfileOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
              <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md shadow-2xl relative animate-fade-in-up">
                  <button onClick={() => setIsProfileOpen(false)} className="absolute top-4 right-4 text-neutral-500 hover:text-white"><X size={20}/></button>
                  
                  <div className="p-6 pb-2 border-b border-neutral-800">
                      <div className="flex items-center gap-4">
                         <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center border-2 border-orange-500/50 overflow-hidden">
                             {editProfile.avatarUrl ? <img src={editProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : <User size={32} className="text-neutral-400"/>}
                         </div>
                         <div>
                             <h2 className="text-lg font-bold text-white uppercase tracking-wider">User Profile</h2>
                             <p className="text-xs text-neutral-500 font-mono">ID: {editProfile.id}</p>
                         </div>
                      </div>
                  </div>
                  
                  <form onSubmit={handleProfileSave} className="p-6 space-y-4">
                      <div className="space-y-1">
                          <label className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase"><User size={12} /> Full Name</label>
                          <input required value={editProfile.name} onChange={e => setEditProfile({...editProfile, name: e.target.value})} className="w-full bg-black border border-neutral-700 p-2 text-sm text-white focus:border-orange-500 outline-none font-mono" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1">
                             <label className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase"><Mail size={12} /> Email</label>
                             <input required type="email" value={editProfile.email} onChange={e => setEditProfile({...editProfile, email: e.target.value})} className="w-full bg-black border border-neutral-700 p-2 text-xs text-neutral-300 focus:border-orange-500 outline-none font-mono" />
                         </div>
                         <div className="space-y-1">
                             <label className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase"><Phone size={12} /> Phone</label>
                             <input value={editProfile.phoneNumber || ''} onChange={e => setEditProfile({...editProfile, phoneNumber: e.target.value})} placeholder="+1 234..." className="w-full bg-black border border-neutral-700 p-2 text-xs text-neutral-300 focus:border-orange-500 outline-none font-mono" />
                         </div>
                      </div>
                      
                      <div className="space-y-1">
                          <label className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase"><Briefcase size={12} /> Role / Title</label>
                          <input value={editProfile.role || ''} onChange={e => setEditProfile({...editProfile, role: e.target.value})} placeholder="e.g. Senior Analyst" className="w-full bg-black border border-neutral-700 p-2 text-xs text-neutral-300 focus:border-orange-500 outline-none font-mono" />
                      </div>

                      <div className="space-y-1">
                          <label className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase"><Edit2 size={12} /> Bio</label>
                          <textarea value={editProfile.bio || ''} onChange={e => setEditProfile({...editProfile, bio: e.target.value})} rows={3} placeholder="Brief bio..." className="w-full bg-black border border-neutral-700 p-2 text-xs text-neutral-300 focus:border-orange-500 outline-none font-mono resize-none" />
                      </div>
                      
                      <div className="flex gap-3 pt-2">
                           <button type="button" onClick={() => onLogout()} className="flex-1 bg-red-900/20 text-red-500 hover:bg-red-900/40 border border-red-900/50 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                               <LogOut size={14} /> Sign Out
                           </button>
                           <button type="submit" className="flex-1 bg-orange-600 text-black hover:bg-orange-500 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                               <BadgeCheck size={14} /> Save Profile
                           </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Content Viewer Modal */}
      {viewingSource && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
              <div className="bg-neutral-950 border border-neutral-800 w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl relative">
                  
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900">
                      <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded ${
                                viewingSource.mimeType === 'application/pdf' ? 'bg-red-500/10 text-red-500' :
                                viewingSource.type === 'image' ? 'bg-purple-500/10 text-purple-500' : 
                                viewingSource.title.includes('DB') ? 'bg-green-500/10 text-green-500' :
                                viewingSource.title.includes('API') ? 'bg-blue-500/10 text-blue-500' :
                                'bg-orange-500/10 text-orange-500'
                          }`}>
                                {viewingSource.mimeType === 'application/pdf' ? <FileText size={18} /> :
                                 viewingSource.type === 'image' ? <ImageIcon size={18} /> : 
                                 viewingSource.title.includes('DB') ? <Database size={18} /> :
                                 viewingSource.title.includes('API') ? <Globe size={18} /> :
                                 <FileText size={18} />}
                          </div>
                          <div>
                              <h3 className="text-sm font-bold text-white uppercase tracking-wider">{viewingSource.title}</h3>
                              <p className="text-[10px] text-neutral-500 font-mono uppercase">ID: {viewingSource.id} // TYPE: {viewingSource.type}</p>
                          </div>
                      </div>
                      <div className="flex items-center gap-2">
                          <button 
                              onClick={handleRemoveAndClose}
                              className="p-2 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 transition-colors rounded"
                              title="Delete Source"
                          >
                              <Trash2 size={16} />
                          </button>
                          <div className="h-4 w-px bg-neutral-800 mx-1"></div>
                          <button 
                              onClick={() => setViewingSource(null)}
                              className="p-2 text-neutral-500 hover:text-white transition-colors"
                          >
                              <X size={20} />
                          </button>
                      </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-auto p-6 bg-black">
                      {viewingSource.type === 'image' ? (
                          <div className="flex justify-center">
                              <img src={viewingSource.content} alt={viewingSource.title} className="max-w-full rounded border border-neutral-800" />
                          </div>
                      ) : viewingSource.mimeType === 'application/pdf' ? (
                          <div className="h-full flex flex-col items-center justify-center gap-4 text-neutral-500">
                              <FileText size={48} className="text-neutral-700" />
                              <div className="text-center">
                                  <p className="text-xs uppercase tracking-widest mb-2">PDF Document Preview</p>
                                  {viewingSource.content.startsWith('data:') ? (
                                      <iframe 
                                          src={viewingSource.content} 
                                          className="w-full h-[60vh] border border-neutral-800 bg-white"
                                          title="PDF Preview"
                                      />
                                  ) : (
                                      <p className="text-xs font-mono text-red-500">Preview Unavailable</p>
                                  )}
                              </div>
                          </div>
                      ) : (
                          <pre className="text-xs font-mono text-neutral-300 whitespace-pre-wrap leading-relaxed">
                              {viewingSource.content}
                          </pre>
                      )}
                  </div>

                  {/* Footer */}
                  <div className="p-2 border-t border-neutral-800 bg-neutral-900 text-right">
                      <span className="text-[9px] text-neutral-600 uppercase tracking-widest font-mono">
                          HGI Secure Viewer v1.0
                      </span>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Sidebar;