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

## 🌐 Deploy en Producción (Vercel)

### 1. Configurar Variables de Entorno en Vercel

En tu dashboard de Vercel, agrega las siguientes variables de entorno:

**Variables Frontend (VITE_):**
```
VITE_DATA_PROVIDER=supabase
VITE_AI_PROVIDER=gemini_proxy
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

### 2. Configurar API Key en Supabase Edge Function

Para producción, la API Key de Gemini debe configurarse en Supabase (no en Vercel):

1. Ve a Supabase Dashboard → Edge Functions → gemini-proxy
2. En la sección "Environment Variables", agrega:
   ```
   GEMINI_API_KEY=your_new_gemini_api_key_here
   GEMINI_DAILY_TOKEN_LIMIT=1000000
   GEMINI_REQUESTS_PER_HOUR=100
   ```
3. Redeploy la función

### 3. Configurar Rate Limiting (Control de Costos)

El Edge Function `gemini-proxy` incluye rate limiting para controlar costos:

- **GEMINI_DAILY_TOKEN_LIMIT**: Límite diario de tokens (default: 1,000,000)
- **GEMINI_REQUESTS_PER_HOUR**: Límite de requests por hora (default: 100)

Ajusta estos valores según tu presupuesto y uso esperado.

### 4. Obtener Nueva API Key de Gemini

1. Ve a [Google AI Studio > API Keys](https://aistudio.google.com/app/apikey)
2. Crea una nueva API key
3. **Importante**: En "Client restrictions", selecciona **"None"** para evitar errores 403
4. Copia la key y configúrala en Supabase Edge Function (paso 2)

### 5. Deploy en Vercel

```bash
# Instalar Vercel CLI (si no está instalado)
npm i -g vercel

# Deploy
vercel
```

Sigue las instrucciones y confirma las variables de entorno.

## 📚 Documentación

- [Backend Contract](docs/BACKEND_CONTRACT.md)
- [Gemini Setup](docs/GEMINI_SETUP.md)
- [Voice Auth Flow](docs/VOICE_AUTH_FLOW.md)
