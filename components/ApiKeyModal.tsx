import React, { useState } from 'react';
import { Key, Check, ExternalLink, AlertTriangle, X } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onSave: (key: string) => void;
  onClose: () => void;
  hasSystemKey: boolean;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onSave, onClose, hasSystemKey }) => {
  const [key, setKey] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) {
        onSave(key.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 font-mono">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md p-6 relative shadow-2xl animate-fade-in-up">
        {hasSystemKey && (
             <button onClick={onClose} className="absolute top-4 right-4 text-neutral-500 hover:text-white">
                 <X size={20} />
             </button>
        )}
        
        <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 mb-4 border border-orange-500/20">
                <Key size={24} />
            </div>
            <h2 className="text-xl font-bold text-white uppercase tracking-wider">Configuración API Key</h2>
            <p className="text-xs text-neutral-500 mt-2 text-center max-w-xs">
                Se requiere una Google Gemini API Key válida. Esta clave se guardará de forma segura en el almacenamiento local de tu navegador.
            </p>
        </div>

        {!hasSystemKey && (
            <div className="bg-red-900/20 border border-red-900/50 p-3 mb-6 flex gap-3 items-start">
                <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-red-200 leading-relaxed">
                    <strong>Atención:</strong> No se detectó configuración de entorno. Debes ingresar tu clave manualmente aquí para usar la aplicación.
                </p>
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-2">Tu Gemini API Key</label>
                <input 
                    type="password" 
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-black border border-neutral-700 p-3 text-sm text-white focus:border-orange-500 outline-none transition-colors font-mono"
                    autoFocus
                />
            </div>

            <button 
                type="submit" 
                disabled={!key.trim()}
                className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold uppercase text-xs py-3 tracking-widest transition-all flex items-center justify-center gap-2"
            >
                <Check size={16} /> Guardar y Conectar
            </button>
        </form>

        <div className="mt-6 pt-4 border-t border-neutral-800 flex justify-center">
            <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 uppercase font-bold tracking-wide"
            >
                Obtener API Key <ExternalLink size={10} />
            </a>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;