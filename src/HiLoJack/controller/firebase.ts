// Re-export the same Firebase Realtime DB instance the Bananagrams game uses,
// per EXECPLAN §4.3 — one Firebase app for the whole site.
export { db } from "../../Banagrams/engine/firebase/firebase";
