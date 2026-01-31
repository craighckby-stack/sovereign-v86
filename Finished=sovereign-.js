// NEXUS_EVO: 9SK4SQ
// NEXUS_EVO: TVAFR6
// NEXUS_EVO: 44ENUU
This file has been edited for improved clarity, consistency, and internal documentation, particularly around complex asynchronous logic and utility functions.

```javascript
import React, { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, writeBatch, query, onSnapshot,
  serverTimestamp, limit, doc
} from 'firebase/firestore';
import {
  getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged
} from 'firebase/auth';

/**
 * Sovereign v86: Multi-Model Production Kernel
 *
 * This core application component manages the agent's lifecycle,
 * authentication, configuration, and the autonomous execution loop.
 * It utilizes React hooks (useReducer, useCallback) for state management
 * and integrates Firebase Firestore for real-time data persistence and insights.
 */

const CORE_CONFIG = {
  BATCH_SIZE: 5, // Number of mutations to buffer before committing to Firestore.
  BUFFER_MAX: 50, // Maximum size of the local file queue (currently unused in filtering).
  CYCLE_INTERVAL: 45000, // 45 seconds - Polling interval for the runCycle execution loop.
  MODELS: [
    { id: 'gemini-2.5-flash-lite-preview-09-2025', label: 'Lite', tier: 'Lite' },
    { id: 'gemini-2.5-flash-preview-09-2025', label: 'Flash 2.5', tier: 'Pro' },
    { id: 'gemini-3-flash-preview-09-2025', label: 'Flash 3.0', tier: 'Exp' }
  ],
  APP_ID: typeof __app_id !== 'undefined' ? __app_id : 'emg-v86-sovereign' // Unique application identifier for Firestore partitioning.
};

// Initialize Firebase services
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const initialState = {
  isLive: false, // Flag indicating if the autonomous cycle is running.
  isAcknowledged: false, // Flag for the initial landing screen bypass.
  status: 'IDLE', // Current operational status (IDLE, SCAN, ANALYZING, etc.).
  activePath: 'Ready', // The file path currently being processed.
  selectedModel: localStorage.getItem('emg_active_model_v86') || CORE_CONFIG.MODELS[0].id, // The currently active Gemini model ID.
  modelHealth: JSON.parse(localStorage.getItem('emg_health_v86')) || {}, // Tracks rate-limiting blocks per model.
  targetRepo: localStorage.getItem('emg_repo_v86') || '', // Target GitHub repository path (e.g., 'owner/repo').
  logs: [], // Console output history.
  insights: [], // Real-time insights fetched from Firestore.
  bufferCount: 0, // Current count of pending mutations in the local buffer.
  metrics: { mutations: 0, skipped: 0, errors: 0, latency: 0, progress: 0 } // Operational statistics.
};

/**
 * State management reducer for the application.
 * @param {object} state - The current state object.
 * @param {object} action - The action object containing type and payload.
 * @returns {object} The new state.
 */
function reducer(state, action) {
  switch (action.type) {
    case 'SET_VAL':
      // Sets a generic key-value pair, persisting targetRepo and selectedModel to localStorage.
      if (action.key === 'targetRepo') localStorage.setItem('emg_repo_v86', action.value);
      if (action.key === 'selectedModel') localStorage.setItem('emg_active_model_v86', action.value);
      return { ...state, [action.key]: action.value };
    case 'ACKNOWLEDGE':
      // Bypasses the initial landing screen.
      return { ...state, isAcknowledged: true };
    case 'TOGGLE':
      // Toggles the main operational state (isLive).
      const newLive = !state.isLive;
      return { ...state, isLive: newLive, status: newLive ? 'INITIALIZING' : 'IDLE', activePath: 'Ready' };
    case 'LOG':
      // Adds a new log entry, truncating the list to 40 items.
      return { ...state, logs: [{ ...action.payload, id: Date.now() + Math.random() }, ...state.logs].slice(0, 40) };
    case 'UPDATE_METRICS':
      // Updates operational metrics (mutations, errors, latency, progress).
      return { ...state, metrics: { ...state.metrics, ...action.payload } };
    case 'SET_BUFFER':
      // Updates the count of items in the local mutation buffer.
      return { ...state, bufferCount: action.value };
    case 'SET_INSIGHTS':
      // Sets the list of archived insights (from Firestore).
      return { ...state, insights: action.payload };
    case 'SET_STATUS':
      // Updates the current operational status and active file path.
      return { ...state, status: action.value, activePath: action.path || state.activePath };
    case 'SET_MODEL_BLOCK':
      // Updates the health status of a model, typically due to rate limiting (429).
      const newHealth = { ...state.modelHealth, [action.modelId]: { isBlocked: action.blocked, resetAt: action.resetAt } };
      localStorage.setItem('emg_health_v86', JSON.stringify(newHealth));
      return { ...state, modelHealth: newHealth };
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [user, setUser] = useState(null);

  // Refs for sensitive inputs and operational state
  const ghTokenRef = useRef('');
  const geminiKeyRef = useRef('');
  const isBusy = useRef(false); // Prevents concurrent execution of runCycle
  const queueRef = useRef([]); // The list of files pending refactoring
  const indexRef = useRef(parseInt(localStorage.getItem('emg_cursor_v86'), 10) || 0); // Current position in the queue
  const mutationBuffer = useRef([]); // Local buffer for pending Firestore writes
  const metricsRef = useRef(state.metrics); // Syncs metrics for safe access within async loops

  /**
   * Pushes a new message to the console log.
   * @param {string} msg - The message content.
   * @param {('info'|'error'|'success')} [type='info'] - The log type, affecting color coding.
   */
  const pushLog = (msg, type = 'info') => dispatch({
    type: 'LOG',
    payload: {
      msg,
      type,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
  });

  // Sync metrics ref for safe access within the asynchronous cycle loop
  useEffect(() => { metricsRef.current = state.metrics; }, [state.metrics]);

  // Authentication Setup: Handles custom token or anonymous sign-in.
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        pushLog("Authentication Failed", "error");
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Real-time Data Synchronization (Insights)
  useEffect(() => {
    if (!user) return;
    // Query for the 15 most recent insights for the current user.
    const q = query(collection(db, 'artifacts', CORE_CONFIG.APP_ID, 'users', user.uid, 'insights'), limit(15));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      dispatch({ type: 'SET_INSIGHTS', payload: data });
    }, (err) => pushLog("Cloud Sync error: " + err.code, "error"));

    return () => unsubscribe();
  }, [user]);

  /**
   * Flushes the current mutation buffer to Firestore using batch writes.
   * This persists the record of successful refactoring operations (insights).
   */
  const flushMutationBuffer = async () => {
    if (mutationBuffer.current.length === 0 || !user) return;
    try {
      const batch = writeBatch(db);
      mutationBuffer.current.forEach(item => {
        const ref = doc(collection(db, 'artifacts', CORE_CONFIG.APP_ID, 'users', user.uid, 'insights'));
        batch.set(ref, {
          filePath: item.filePath,
          model: state.selectedModel,
          timestamp: serverTimestamp()
        });
      });
      await batch.commit();
      pushLog(`Persisted ${mutationBuffer.current.length} items to vault`, "success");
      mutationBuffer.current = [];
      dispatch({ type: 'SET_BUFFER', value: 0 });
    } catch (e) {
      pushLog("Vault commit failed", "error");
    }
  };

  /**
   * Fetches a resource with exponential backoff and handles rate limiting (429).
   * If a 429 is received, the current model is blocked for 60 seconds.
   * @param {string} url - The resource URL.
   * @param {object} [options={}] - Fetch options.
   * @param {number} [retries=5] - Maximum number of retries.
   * @param {number} [backoff=1000] - Initial backoff delay in milliseconds.
   * @returns {Promise<Response>} The successful fetch response.
   * @throws {Error} If all retries fail or a non-recoverable error occurs.
   */
  const fetchWithRetry = async (url, options = {}, retries = 5, backoff = 1000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 45000); // 45s timeout
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);

      if (res.status === 429) {
        const resetAt = Date.now() + 60000; // Block model for 60 seconds
        dispatch({ type: 'SET_MODEL_BLOCK', modelId: state.selectedModel, blocked: true, resetAt });
        throw new Error("Rate Limited");
      }
      return res;
    } catch (e) {
      clearTimeout(id);
      if (retries > 0) {
        await new Promise(r => setTimeout(r, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw e;
    }
  };

  /**
   * Core execution loop for scanning, analyzing, and committing refactoring changes.
   * This function runs periodically based on CORE_CONFIG.CYCLE_INTERVAL.
   */
  const runCycle = useCallback(async () => {
    if (!state.isLive || isBusy.current || !user) return;

    // Model Health Check: Switch models if the current one is blocked.
    if (state.modelHealth[state.selectedModel]?.isBlocked) {
      const nextAvailable = CORE_CONFIG.MODELS.find(m => !state.modelHealth[m.id]?.isBlocked);
      if (nextAvailable) {
        pushLog(`Model ${state.selectedModel} blocked. Switching to ${nextAvailable.label}.`, "info");
        dispatch({ type: 'SET_VAL', key: 'selectedModel', value: nextAvailable.id });
        return;
      } else {
        pushLog("All models are under global cooldown. Stopping.", "error");
        dispatch({ type: 'TOGGLE' });
        return;
      }
    }

    isBusy.current = true;
    const startTime = performance.now();
    let outcome = 'NONE';
    let currentPath = '';

    try {
      const repo = state.targetRepo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
      const ghToken = ghTokenRef.current.trim();
      const geminiKey = geminiKeyRef.current.trim();

      if (!repo.includes('/') || !ghToken || !geminiKey) throw new Error("Credentials Missing");
      const headers = { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' };

      // 1. Queue Building (Initial Scan)
      // Fetches the repository tree recursively if the queue is empty.
      if (queueRef.current.length === 0) {
        dispatch({ type: 'SET_STATUS', value: 'SCAN' });
        const rRes = await fetchWithRetry(`https://api.github.com/repos/${repo}`, { headers });
        const rData = await rRes.json();
        const tRes = await fetchWithRetry(`https://api.github.com/repos/${repo}/git/trees/${rData.default_branch}?recursive=1`, { headers });
        const tData = await tRes.json();
        queueRef.current = (tData?.tree || [])
          .filter(f => f.type === 'blob' && f.path.match(/\.(js|jsx|ts|tsx|py|html|css|md)$/i))
          .map(f => f.path);
      }

      currentPath = queueRef.current[indexRef.current];
      if (!currentPath) {
        pushLog("Queue Exhausted. Cycle complete.", "success");
        dispatch({ type: 'TOGGLE' });
        return;
      }

      // 2. Fetch Content (GitHub API)
      dispatch({ type: 'SET_STATUS', value: 'ANALYZING', path: currentPath });
      const fRes = await fetchWithRetry(`https://api.github.com/repos/${repo}/contents/${currentPath}`, { headers });
      const fData = await fRes.json();

      /** Converts Base64 content string to UTF-8 source code. */
      const b64ToUtf8 = (str) => decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      /** Converts UTF-8 source code to Base64 content string for GitHub API. */
      const utf8ToB64 = (str) => btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m, p) => String.fromCharCode('0x' + p)));

      const raw = b64ToUtf8(fData.content);

      // 3. AI Logic (Refactoring Request to Gemini)
      const aiRes = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${state.selectedModel}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `Act as a senior software architect. Refactor and optimize this file for clarity, performance, and best practices. Return only the updated source code block without any markdown formatting.\n\nFILE: ${currentPath}\nCONTENT:\n${raw}` }] }] })
      });

      const aiData = await aiRes.json();
      // Clean the response: Strip markdown code fences (e.g., ```javascript ... ```)
      const optimized = aiData?.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();

      // 4. Commit Strategy (Pushing changes back to GitHub)
      if (!optimized || optimized === raw) {
        outcome = 'SKIP';
        pushLog(`No change detected for ${currentPath.split('/').pop()}`);
      } else {
        const putRes = await fetchWithRetry(`https://api.github.com/repos/${repo}/contents/${currentPath}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            message: `[Sovereign v86] Optimized ${currentPath}`,
            content: utf8ToB64(optimized),
            sha: fData.sha // Required for optimistic locking/version control
          })
        });

        if (putRes.ok) {
          outcome = 'MUTATE';
          pushLog(`Optimized ${currentPath}`, "success");
          mutationBuffer.current.push({ filePath: currentPath });
          dispatch({ type: 'SET_BUFFER', value: mutationBuffer.current.length });
          if (mutationBuffer.current.length >= CORE_CONFIG.BATCH_SIZE) {
            await flushMutationBuffer();
          }
        } else {
          outcome = 'ERROR';
          pushLog(`Push failed: ${currentPath}`, "error");
        }
      }
    } catch (e) {
      pushLog(e.message, "error");
      outcome = 'ERROR';
    } finally {
      // 5. Update Metrics and Cursor
      // Calculates progress, updates metrics, and advances the file cursor.
      const total = queueRef.current.length || 1;
      const progress = Math.round(((indexRef.current + 1) / total) * 100);

      dispatch({
        type: 'UPDATE_METRICS',
        payload: {
          progress: Math.min(progress, 100),
          mutations: metricsRef.current.mutations + (outcome === 'MUTATE' ? 1 : 0),
          skipped: metricsRef.current.skipped + (outcome === 'SKIP' ? 1 : 0),
          errors: metricsRef.current.errors + (outcome === 'ERROR' ? 1 : 0),
          latency: Math.round(performance.now() - startTime)
        }
      });

      indexRef.current++;
      localStorage.setItem('emg_cursor_v86', indexRef.current.toString());
      isBusy.current = false;
    }
  }, [state.isLive, state.targetRepo, state.selectedModel, user, state.modelHealth]);

  // Polling loop setup
  useEffect(() => {
    let t;
    if (state.isLive) {
      runCycle();
      t = setInterval(runCycle, CORE_CONFIG.CYCLE_INTERVAL);
    }
    return () => clearInterval(t);
  }, [state.isLive, runCycle]);

  // Acknowledgement / Landing screen
  if (!state.isAcknowledged) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-white font-sans overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px]" />
        </div>
        <div className="max-w-md w-full p-10 rounded-[3rem] bg-zinc-900/30 border border-white/5 text-center shadow-2xl backdrop-blur-3xl relative z-10">
          <div className="text-6xl mb-8 animate-bounce">🛰️</div>
          <h1 className="text-4xl font-black italic mb-3 uppercase tracking-tighter">Sovereign <span className="text-emerald-500">v86</span></h1>
          <p className="text-[10px] text-zinc-400 uppercase tracking-[0.4em] mb-12 font-bold opacity-70">Production Grade Code Automator</p>
          <button
            onClick={() => dispatch({ type: 'ACKNOWLEDGE' })}
            className="w-full py-5 bg-emerald-600 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-emerald-500/20 active:scale-95 transition-all hover:bg-emerald-500"
          >
            Enter Command Center
          </button>
          <div className="mt-8 text-[9px] text-zinc-600 font-mono">ENCRYPTED END-TO-END • MULTI-MODEL KERNEL</div>
        </div>
      </div>
    );
  }

  const currentBlocked = state.modelHealth[state.selectedModel]?.isBlocked;

  return (
    <div className="min-h-screen bg-[#020202] text-zinc-400 p-4 md:p-8 lg:p-12 font-sans selection:bg-emerald-500/30 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-10">

        {/* Glass Header */}
        <header className={`p-8 md:p-12 rounded-[2.5rem] md:rounded-[4rem] transition-all duration-700 bg-zinc-900/20 border-2 flex flex-col lg:flex-row items-center justify-between gap-8 relative overflow-hidden backdrop-blur-3xl ${currentBlocked ? 'border-red-600/30 shadow-red-900/10 shadow-2xl' : 'border-white/5'}`}>
          {state.isLive && (
            <div className={`absolute top-0 left-0 w-full h-[1px] animate-[scan_3s_linear_infinite] ${currentBlocked ? 'bg-red-600' : 'bg-emerald-500'}`} />
          )}

          <div className="flex items-center gap-6 md:gap-10 w-full lg:w-auto">
            <div className={`w-16 h-16 md:w-20 md:h-20 rounded-[2rem] flex items-center justify-center text-3xl md:text-4xl border-2 transition-all shrink-0 ${currentBlocked ? 'bg-red-600/10 text-red-500 border-red-600/30' : state.isLive ? 'bg-emerald-600/10 text-emerald-500 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-zinc-800/20 text-white opacity-50 border-white/5'}`}>
              {currentBlocked ? '⚠️' : state.isLive ? '⚡' : '●'}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase italic tracking-tighter truncate">Sovereign v86</h1>
              <div className="flex items-center gap-3 mt-2 min-w-0">
                <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase shrink-0 transition-colors ${currentBlocked ? 'bg-red-600 text-white' : state.isLive ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                  {state.status}
                </span>
                <span className="text-[10px] font-mono text-zinc-500 truncate font-bold uppercase tracking-widest">{state.activePath}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center lg:justify-end gap-4 w-full lg:w-auto">
            {/* Model Health Indicators */}
            <div className="flex gap-2 p-3 bg-black/40 rounded-2xl border border-white/5">
              {CORE_CONFIG.MODELS.map(m => (
                <div key={m.id} className={`w-2.5 h-2.5 rounded-full transition-all ${state.modelHealth[m.id]?.isBlocked ? 'bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.4)]' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]'}`} />
              ))}
            </div>

            <select
              value={state.selectedModel}
              onChange={(e) => dispatch({ type: 'SET_VAL', key: 'selectedModel', value: e.target.value })}
              disabled={state.isLive}
              className="bg-zinc-900/50 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest p-4 rounded-2xl outline-none transition-all hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
            >
              {CORE_CONFIG.MODELS.map(m => {
                const b = state.modelHealth[m.id];
                return <option key={m.id} value={m.id}>{m.label} {b?.isBlocked ? `(BLOCKED)` : ''}</option>
              })}
            </select>

            <button
              onClick={() => dispatch({ type: 'TOGGLE' })}
              className={`px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl ${state.isLive ? 'bg-red-900/20 text-red-500 border border-red-500/20 hover:bg-red-900/30' : 'bg-emerald-600 text-white shadow-emerald-500/20 hover:bg-emerald-500'}`}
            >
              {state.isLive ? 'Emergency Stop' : 'Initiate Engine'}
            </button>
          </div>
        </header>

        {/* Real-time Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
          {[
            { label: 'Cloud Mutations', val: state.metrics.mutations, color: 'text-emerald-500' },
            { label: 'Skipped Tasks', val: state.metrics.skipped, color: 'text-zinc-500' },
            { label: 'Engine Errors', val: state.metrics.errors, color: 'text-red-500' },
            { label: 'Avg Latency', val: `${state.metrics.latency}ms`, color: 'text-blue-400' },
            { label: 'Vault Buffer', val: `${state.bufferCount}/${CORE_CONFIG.BATCH_SIZE}`, color: 'text-white' }
          ].map((s, i) => (
            <div key={i} className="group p-6 md:p-10 bg-zinc-900/10 border border-white/5 rounded-[2.5rem] hover:bg-zinc-900/30 transition-all relative overflow-hidden backdrop-blur-sm">
              <div className={`text-3xl md:text-4xl font-black tracking-tighter mb-2 ${s.color}`}>{s.val}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">{s.label}</div>
              {i === 4 && (
                <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-700" style={{ width: `${(state.bufferCount / CORE_CONFIG.BATCH_SIZE) * 100}%` }} />
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Sidebar Config */}
          <div className="lg:col-span-4 space-y-6">
            <div className="p-8 md:p-10 bg-zinc-900/20 border border-white/5 rounded-[3rem] space-y-8 shadow-2xl backdrop-blur-md">
              <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-zinc-100 flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"></span>
                Protocol Configuration
              </h3>

              <div className="space-y-6">
                {[
                  { id: 'targetRepo', label: 'Repository Path', ph: 'facebook/react' },
                  { id: 'token', label: 'Github Token', ph: 'ghp_secret_key' },
                  { id: 'apiKey', label: 'Gemini API Key', ph: 'aiza_engine_key' }
                ].map((field) => (
                  <div key={field.id} className="space-y-3 group">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1 group-focus-within:text-emerald-500 transition-colors">
                      {field.label}
                    </label>
                    <input
                      type={field.id === 'targetRepo' ? 'text' : 'password'}
                      value={field.id === 'targetRepo' ? state.targetRepo : undefined}
                      onChange={e => field.id === 'targetRepo' ? dispatch({ type: 'SET_VAL', key: 'targetRepo', value: e.target.value }) : (field.id === 'token' ? ghTokenRef.current = e.target.value : geminiKeyRef.current = e.target.value)}
                      disabled={state.isLive}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-sm outline-none text-white font-medium transition-all focus:border-emerald-500/50 focus:bg-black/60 focus:ring-8 focus:ring-emerald-500/5 placeholder:text-zinc-700 disabled:opacity-20"
                      placeholder={field.ph}
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 pt-6 border-t border-white/5">
                <button
                  onClick={flushMutationBuffer}
                  disabled={state.bufferCount === 0}
                  className="w-full py-4 bg-emerald-950/20 text-emerald-400 text-[9px] font-black uppercase rounded-2xl border border-emerald-500/20 hover:bg-emerald-500 hover:text-white disabled:opacity-10 transition-all"
                >
                  Force Vault Sync
                </button>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => { localStorage.setItem('emg_cursor_v86', '0'); window.location.reload(); }}
                        className="py-4 bg-zinc-800/40 text-white text-[9px] font-black uppercase rounded-2xl border border-white/10 hover:bg-zinc-700 transition-all"
                    >
                        Reset Queue
                    </button>
                    <button
                        onClick={() => { if(confirm("Purge all local cache?")) { localStorage.clear(); window.location.reload(); }}}
                        className="py-4 bg-red-950/10 text-red-500 text-[9px] font-black uppercase rounded-2xl border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                    >
                        Factory Wipe
                    </button>
                </div>
              </div>
            </div>
          </div>

          {/* Main Monitor */}
          <div className="lg:col-span-8 space-y-8">
            {/* Live Terminal */}
            <div className="h-[400px] md:h-[500px] bg-black border border-white/10 rounded-[3rem] p-8 md:p-12 flex flex-col overflow-hidden relative shadow-2xl">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Protocol Monitor</span>
                </div>
                <button onClick={() => dispatch({ type: 'SET_VAL', key: 'logs', value: [] })} className="text-[9px] text-zinc-600 font-black hover:text-white uppercase tracking-widest transition-colors">Wipe Console</button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 font-mono text-[11px] scrollbar-hide">
                {state.logs.length === 0 && (
                    <div className="text-zinc-800 italic mt-4 uppercase tracking-tighter">System awaiting initiation...</div>
                )}
                {state.logs.map(l => (
                  <div key={l.id} className="flex gap-6 py-2 border-b border-white/5 items-start group animate-in fade-in slide-in-from-left-2">
                    <span className="text-zinc-700 shrink-0 hidden sm:block group-hover:text-zinc-500 transition-colors font-bold uppercase">{l.timestamp}</span>
                    <span className={`break-all leading-relaxed ${l.type === 'error' ? 'text-red-500 font-black' : l.type === 'success' ? 'text-emerald-400 font-black' : 'text-zinc-300'}`}>
                      {l.msg}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mutation Archive */}
            <div className="bg-zinc-900/10 border border-white/10 rounded-[3rem] p-8 md:p-12">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-white">Mutation Archive</h3>
                <span className="text-[10px] text-zinc-500 font-bold uppercase">Recent Snapshots</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {state.insights.length === 0 && (
                    <div className="col-span-2 text-center py-10 text-zinc-700 font-black uppercase text-[10px] tracking-widest bg-black/20 rounded-3xl border border-dashed border-white/5">No Mutations Archived</div>
                )}
                {state.insights.map(i => (
                  <div key={i.id} className="p-5 bg-black/40 border border-white/10 rounded-[1.5rem] flex flex-col justify-between gap-4 hover:border-emerald-500/40 hover:bg-black/60 transition-all cursor-default">
                    <div className="min-w-0">
                      <div className="text-[10px] md:text-xs font-black text-emerald-400 truncate uppercase italic tracking-tighter mb-1">{i.filePath?.split('/').pop()}</div>
                      <div className="text-[8px] text-zinc-500 font-black uppercase tracking-[0.2em]">{i.filePath}</div>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-white/5">
                        <span className="text-[8px] font-black px-2 py-1 bg-zinc-800 text-zinc-400 rounded-md uppercase">{i.model?.split('-')[2] || 'V86'}</span>
                        <span className="text-[8px] font-mono text-zinc-500 font-bold uppercase">
                        {i.timestamp?.seconds ? new Date(i.timestamp.seconds * 1000).toLocaleTimeString() : 'PENDING'}
                        </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Styles */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        @keyframes scan {
          0% { opacity: 0; transform: translateX(-100%) translateY(0); }
          50% { opacity: 0.8; }
          100% { opacity: 0; transform: translateX(100%) translateY(500px); }
        }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-in { animation: fade-in 0.3s ease-out; }
      `}</style>
    </div>
  );
}
