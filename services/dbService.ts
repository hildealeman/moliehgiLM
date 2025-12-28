import { createClient } from '@supabase/supabase-js';

// Convert Array of Objects to CSV string (LLM friendly format)
const jsonToCsv = (json: any[]): string => {
    if (!json || json.length === 0) return "NO_DATA";
    const header = Object.keys(json[0]).join(',');
    const rows = json.map(obj => Object.values(obj).map(v => 
        typeof v === 'string' && v.includes(',') ? `"${v}"` : v
    ).join(','));
    return `${header}\n${rows.join('\n')}`;
};

export const dbService = {
    // 1. SIMULATOR MODE
    fetchMockData: async (): Promise<string> => {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve("ID,NOMBRE,EMAIL,ULTIMA_COMPRA,TOTAL_GASTADO\n1,Juan Perez,juan@email.com,2023-10-15,450.00\n2,Maria Lopez,maria@email.com,2023-10-18,1200.50\n3,Carlos Ruiz,carlos@email.com,2023-10-20,89.99\n[CONEXION SQL SIMULADA - DATOS ESTATICOS]");
            }, 1000);
        });
    },

    // 2. SUPABASE MODE (Direct DB Access via RLS)
    fetchSupabaseData: async (url: string, key: string, table: string): Promise<string> => {
        try {
            const supabase = createClient(url, key);
            // Fetch first 100 rows to avoid context overflow
            const { data, error } = await supabase.from(table).select('*').limit(100);
            
            if (error) throw new Error(error.message);
            if (!data || data.length === 0) return "TABLA_VACIA";
            
            const csv = jsonToCsv(data);
            return csv + "\n[ORIGEN: SUPABASE LIVE DB]";
        } catch (e: any) {
            throw new Error(`Error Supabase: ${e.message}`);
        }
    },

    // 3. REST API MODE (Connects to your existing backend)
    fetchApiData: async (endpoint: string, authToken?: string): Promise<string> => {
        try {
            const headers: any = { 'Content-Type': 'application/json' };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

            const res = await fetch(endpoint, { headers });
            if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
            
            const json = await res.json();
            
            // Handle wrapper objects (e.g. { data: [...] })
            const dataArray = Array.isArray(json) ? json : (json.data || json.items || []);
            
            if (!Array.isArray(dataArray) || dataArray.length === 0) return "API_SIN_RESULTADOS_TABULARES";

            const csv = jsonToCsv(dataArray);
            return csv + `\n[ORIGEN: API EXT ${endpoint}]`;
        } catch (e: any) {
            throw new Error(`Error API: ${e.message}`);
        }
    }
};