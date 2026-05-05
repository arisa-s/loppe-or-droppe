type ExpoPublicEnv = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
};

type SupabaseEnv = {
  url: string;
  anonKey: string;
};

function readRequiredEnv(
  env: ExpoPublicEnv,
  key: keyof ExpoPublicEnv,
): string {
  const value = env[key];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function readSupabaseEnv(
  env: ExpoPublicEnv = process.env as ExpoPublicEnv,
): SupabaseEnv {
  return {
    url: readRequiredEnv(env, "EXPO_PUBLIC_SUPABASE_URL"),
    anonKey: readRequiredEnv(env, "EXPO_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function tryReadSupabaseEnv(
  env: ExpoPublicEnv = process.env as ExpoPublicEnv,
): SupabaseEnv | null {
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (
    url === undefined ||
    url.trim().length === 0 ||
    anonKey === undefined ||
    anonKey.trim().length === 0
  ) {
    return null;
  }

  return { url, anonKey };
}
