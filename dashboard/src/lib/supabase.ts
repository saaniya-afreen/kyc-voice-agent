import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Fails loudly at startup rather than producing confusing "fetch failed" errors later.
  console.error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set — see .env.example");
}

export const supabase = createClient(url, anonKey);
