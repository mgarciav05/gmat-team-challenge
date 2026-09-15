/**
 * GMAT TEAM CHALLENGE — configuration
 * ------------------------------------
   * This is the ONLY file you should need to edit. Everything here is a
   * plain value — no programming required. See SETUP_GUIDE.md for the full
 * step-by-step (it explains exactly what to paste where, in plain language).
   *
   * NOTE: this is the template version of this file (safe placeholder values,
   * BACKEND_MODE = "demo"). The real, filled-in config used for the live
 * class (real Firebase keys + the actual Host Dashboard password) is kept
 * only on the facilitator's own computer and in the deployed site — it is
   * intentionally NOT committed to this public repository.
   */

// "demo"  -> zero setup. Works only across browser tabs on THIS computer.
//            Use this to build/rehearse the class alone before the real day.
// "firebase" -> real multi-device sync. Use this for the actual class so
//            every student's phone and your laptop share the same data.
//            Requires filling in FIREBASE_CONFIG below (SETUP_GUIDE.md
//            walks through getting this, it takes about 10 minutes).
const BACKEND_MODE = "demo";

// Paste the object Firebase gives you when you create a Web App in your
// Firebase project (Project settings -> General -> Your apps -> Web app).
// Only needed when BACKEND_MODE = "firebase". Leave as-is for demo mode.
const FIREBASE_CONFIG = {
  apiKey: "PEGA_AQUI_TU_API_KEY",
    authDomain: "PEGA_AQUI_TU_PROYECTO.firebaseapp.com",
    projectId: "PEGA_AQUI_TU_PROYECTO",
    storageBucket: "PEGA_AQUI_TU_PROYECTO.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx",
    };

// A short id for this specific class session. Changing this string starts
// a completely fresh, empty challenge (useful if you teach the same class
// twice — use "fic-gmat-2026-am" and "fic-gmat-2026-pm", for example).
const SESSION_ID = "fic-gmat-challenge-2026";

// The password the facilitator types to unlock the Host Dashboard.
// This is a SIMPLE deterrent, not real security — see SETUP_GUIDE.md and
// the "Seguridad y anti-trampa" section of the write-up for what this does
// and does not protect against.
const HOST_PASSWORD = "CAMBIA_ESTA_CONTRASENA";

// The public URL where this app is hosted, once deployed (GitHub Pages,
// Netlify, Vercel...). This is what gets turned into the QR code students
// scan to join. Left as "" while you're only testing locally.
const APP_URL = "";
