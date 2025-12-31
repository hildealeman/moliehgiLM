# MolieLM - HGI (Human Grounded Intelligence)

Hecho en Mexico por ingenio 100% Mexicano, VistaDev Mexico. https://vistadev.mx

MolieLM es una herramienta en Español inspirada en NotebookLM para ingerir documentos, conectar ideas y generar resultados (texto, imágenes y audio en tiempo real) con modelos Gemini.

## 🏗 Arquitectura

MolieLM usa una **arquitectura híbrida por adaptadores**:

1. **Modo Local (Mock / Default):**
   - **Base de datos:** IndexedDB (navegador)
   - **Storage:** IndexedDB (archivos como Blobs)
   - **AI:** llamadas del cliente
   - *Cero configuración requerida.*

2. **Modo Cloud (Producción):**
   - **Base de datos:** Supabase Postgres
   - **Storage:** Supabase Storage (`molielm-sources` bucket)
   - **AI:** Supabase Edge Function (`gemini-proxy`)
   - **Auth:** Voice Gate + Supabase Auth

## 🚀 Inicio Rápido (Modo Local)

1. **Clonar e instalar**:
   ```bash
   git clone <repo>
   cd molielm
   npm install
   ```

2. **Correr en dev**:
   ```bash
   npm run dev
   ```

## ☁️ Setup Cloud (Supabase)

Ver [docs/WINDSURF_HANDOFF.md](docs/WINDSURF_HANDOFF.md) para instrucciones automatizadas.

### Pasos Manuales

1. Crear un proyecto en Supabase.
2. Correr migraciones dentro de `supabase/migrations` (SQL Editor o `supabase db push`).
3. Deploy de Edge Functions en `supabase/functions`.
4. Configurar variables de entorno en `.env`:
   ```
   VITE_DATA_PROVIDER=supabase
   VITE_AI_PROVIDER=gemini_proxy
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```

## 📚 Documentación

- [Backend Contract](docs/BACKEND_CONTRACT.md)
- [Gemini Setup](docs/GEMINI_SETUP.md)
- [Voice Auth Flow](docs/VOICE_AUTH_FLOW.md)
