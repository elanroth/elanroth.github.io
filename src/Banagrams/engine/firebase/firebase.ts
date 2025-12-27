import { initializeApp, getApps, getApp } from "firebase/app";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";

const cfg = {
  apiKey: import.meta.env.VITE_FB_API_KEY ?? import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN ?? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID ?? import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: (import.meta.env.VITE_FB_DATABASE_URL ?? import.meta.env.VITE_FIREBASE_DATABASE_URL)?.replace(/\/$/, ""),
  appId: import.meta.env.VITE_FB_APP_ID ?? import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FB_MEASUREMENT_ID ?? import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (!cfg.projectId) throw new Error("[FB] Missing PROJECT_ID (set VITE_FB_PROJECT_ID or VITE_FIREBASE_PROJECT_ID)");
if (!cfg.databaseURL && !import.meta.env.VITE_FB_USE_EMULATOR) throw new Error("[FB] Missing DATABASE_URL (set VITE_FB_DATABASE_URL or VITE_FIREBASE_DATABASE_URL)");

const app = getApps().length ? getApp() : initializeApp(cfg);
export const db = getDatabase(app);

// Local emulator support so you can develop without deploying
if (import.meta.env.VITE_FB_USE_EMULATOR) {
  const host = import.meta.env.VITE_FB_EMULATOR_HOST ?? "127.0.0.1";
  const port = Number(import.meta.env.VITE_FB_EMULATOR_PORT ?? 9000);
  connectDatabaseEmulator(db, host, port);
}

if (import.meta.env.PROD && cfg.measurementId) {
  import("firebase/analytics")
    .then(async ({ getAnalytics, isSupported }) => (await isSupported()) && getAnalytics(app))
    .catch(() => {});
}
