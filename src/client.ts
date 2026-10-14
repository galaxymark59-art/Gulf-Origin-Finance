import { createClient } from "@supabase/supabase-js";
import { native, nativeSessionStorage } from "./native";
import { desktop, desktopSessionStorage } from "./desktop";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const supabase = createClient(
  url || "https://unconfigured.supabase.co",
  key || "unconfigured",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !native,
      flowType: "pkce",
      ...(native ? { storage: nativeSessionStorage } : {}),
      ...(desktop ? { storage: desktopSessionStorage } : {}),
    },
  },
);
