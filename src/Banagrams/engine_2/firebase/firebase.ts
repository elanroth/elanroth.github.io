import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const cfg = {
  apiKey: import.meta.env.VITE_FB_API_KEY ?? import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN ?? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID ?? import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: (import.meta.env.VITE_FB_DATABASE_URL ?? import.meta.env.VITE_FIREBASE_DATABASE_URL)?.replace(/\/$/, ""),
  appId: import.meta.env.VITE_FB_APP_ID ?? import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FB_MEASUREMENT_ID ?? import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// quick sanity log (remove after you see values)
console.log("[FB env]", {
  projectId: cfg.projectId,
  hasDbUrl: !!cfg.databaseURL,
});

if (!cfg.projectId) throw new Error("[FB] Missing PROJECT_ID (set VITE_FB_PROJECT_ID or VITE_FIREBASE_PROJECT_ID)");
if (!cfg.databaseURL) throw new Error("[FB] Missing DATABASE_URL (set VITE_FB_DATABASE_URL or VITE_FIREBASE_DATABASE_URL)");

const app = getApps().length ? getApp() : initializeApp(cfg);
export const db = getDatabase(app);

if (import.meta.env.PROD && cfg.measurementId) {
  import("firebase/analytics")
    .then(async ({ getAnalytics, isSupported }) => (await isSupported()) && getAnalytics(app))
    .catch(() => {});
}
