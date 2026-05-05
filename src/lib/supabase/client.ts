import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { tryReadSupabaseEnv } from "./env";

let cachedClient: SupabaseClient | null | undefined;
const memoryStorage = new Map<string, string>();

function authStorage() {
  if (typeof window === "undefined") {
    return {
      getItem: async (key: string) => memoryStorage.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        memoryStorage.set(key, value);
      },
      removeItem: async (key: string) => {
        memoryStorage.delete(key);
      },
    };
  }

  return AsyncStorage;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const env = tryReadSupabaseEnv();
  if (env === null) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(env.url, env.anonKey, {
    auth: {
      storage: authStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return cachedClient;
}
