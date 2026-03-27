import { initializeApp, getApps, getApp } from "firebase/app";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";

const env = import.meta.env as Record<string, string | undefined>;

const readEnv = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
};

const isTruthyEnv = (value?: string): boolean => value === "true" || value === "1";

const cfg = {
  apiKey: readEnv("VITE_FIREBASE_API_KEY", "VITE_FB_API_KEY"),
  authDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN", "VITE_FB_AUTH_DOMAIN"),
  projectId: readEnv("VITE_FIREBASE_PROJECT_ID", "VITE_FB_PROJECT_ID"),
  databaseURL: readEnv("VITE_FIREBASE_DATABASE_URL", "VITE_FB_DATABASE_URL")?.replace(/\/$/, ""),
  appId: readEnv("VITE_FIREBASE_APP_ID", "VITE_FB_APP_ID"),
  measurementId: readEnv("VITE_FIREBASE_MEASUREMENT_ID", "VITE_FB_MEASUREMENT_ID"),
};

const useEmulatorEnv = readEnv("VITE_FIREBASE_USE_EMULATOR", "VITE_FB_USE_EMULATOR");
const isLocalhost = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
const emulatorRequested = isTruthyEnv(useEmulatorEnv);
const useEmulator = (import.meta.env.DEV || isLocalhost) && (emulatorRequested || (!useEmulatorEnv && import.meta.env.DEV && isLocalhost));

if (!cfg.projectId) throw new Error("[FB] Missing PROJECT_ID (set VITE_FB_PROJECT_ID or VITE_FIREBASE_PROJECT_ID)");
if (!cfg.databaseURL && !useEmulator) throw new Error("[FB] Missing DATABASE_URL (set VITE_FB_DATABASE_URL or VITE_FIREBASE_DATABASE_URL)");
if (emulatorRequested && !useEmulator) {
  console.warn("[firebase] Ignoring emulator settings outside localhost/dev.");
}

const hasPlaceholderConfig =
  cfg.apiKey === "dummy" ||
  cfg.appId === "dummy" ||
  cfg.authDomain === "dummy.firebaseapp.com" ||
  cfg.projectId === "demo-bananagrams" ||
  cfg.databaseURL?.includes("demo-bananagrams") === true;

if (import.meta.env.PROD && !useEmulator && hasPlaceholderConfig) {
  throw new Error("[FB] Placeholder Firebase config in production build. Set real VITE_FIREBASE_* deployment values.");
}

const app = getApps().length ? getApp() : initializeApp(cfg);
export const db = getDatabase(app);

// Local emulator support so you can develop without deploying
let resolvedDbUrl = cfg.databaseURL ?? "";
if (useEmulator) {
  const host = readEnv("VITE_FIREBASE_EMULATOR_HOST", "VITE_FB_EMULATOR_HOST") ?? "127.0.0.1";
  const port = Number(readEnv("VITE_FIREBASE_EMULATOR_PORT", "VITE_FB_EMULATOR_PORT") ?? 9000);
  resolvedDbUrl = `http://${host}:${port}`;
  connectDatabaseEmulator(db, host, port);
}

console.info(`[firebase] project=${cfg.projectId} dbUrl=${resolvedDbUrl || "<unknown>"} emulator=${useEmulator}`);

if (import.meta.env.PROD && cfg.measurementId) {
  import("firebase/analytics")
    .then(async ({ getAnalytics, isSupported }) => (await isSupported()) && getAnalytics(app))
    .catch(() => {});
}
