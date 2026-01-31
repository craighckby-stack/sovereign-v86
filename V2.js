import React, { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, setDoc, serverTimestamp
} from 'firebase/firestore';
import {
  getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged
} from 'firebase/auth';

// --- Configuration Constants ---
const APP_CONFIG = Object.freeze({
  MAX_FILE_SIZE_BYTES: 500_000,
  CYCLE_INTERVAL_MS: 15_000,
  MAX_API_RETRIES: 3,
  API_TIMEOUT_MS: 60_000,
  LOCAL_STORAGE_PREFIX: 'emg_v86_',
  LOG_HISTORY_LIMIT: 50,
  APP_ID: typeof __app_id !== 'undefined' ? __app_id : 'emg-v86-sovereign',
});

const AI_MODELS = Object.freeze([
  { id: 'gemini-2.5-flash-preview-09-2025', label: 'Flash 2.5 Preview (Default)', tier: 1 },
  { id: 'gemini-1.5-flash', label: 'Flash 1.5 Stable', tier: 2 }
]);

const PROCESSING_PIPELINES = Object.freeze({
  CODE: [{ id: 'refactor', label: 'Refactor', text: 'Act as a Principal Engineer. Refactor for performance, readability, and modern best practices.' }],
  CONFIG: [{ id: 'validate', label: 'Lint', text: 'Act as a DevOps Engineer. Validate syntax and ensure clean configuration.' }],
  MARKDOWN: [{ id: 'grammar', label: 'Clarity', text: 'Act as an Editor. Improve prose and formatting.' }]
});

const FILE_PATTERNS = Object.freeze({
  EXTENSIONS: {
    CODE: /\.(js|jsx|ts|tsx|py|html|css|scss|sql|sh|java|go|rs|rb|php|cpp|c|h)$/i,
    CONFIG: /\.(json|yaml|yml|toml|ini)$/i,
    DOCS: /\.(md|txt|rst|adoc)$/i
  },
  SKIP: [
    /node_modules\//, /\.min\./, /-lock\./, /dist\//, /build\//, /\.git\//
  ]
});

const PERSISTENCE_KEYS = new Set(['selectedModel', 'targetRepo']);

// --- Utility Functions ---

/** Decodes a Base64 string into a UTF-8 string. */
const decodeBase64 = (str) => {
  try {
    // Use Buffer/atob for browser compatibility, ensuring UTF-8 decoding
    const binaryString = atob(str);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    throw new Error(`Base64 decode failed: ${e.message}`);
  }
};

/** Encodes a UTF-8 string into a Base64 string. */
const encodeBase64 = (str) => {
  try {
    const bytes = new TextEncoder().encode(str);
    // Convert byte array to binary string for btoa
    const binaryString = String.fromCodePoint(...bytes);
    return btoa(binaryString);
  } catch (e) {
    throw new Error(`Base64 encode failed: ${e.message}`);
  }
};

/** Creates a URL-safe Firestore document ID from a file path. */
const safeDocId = (path) => btoa(path).replace(/[+/=]/g, '_');

/** Parses a GitHub repository string (e.g., 'user/repo') into [owner, repo]. */
const parseRepoPath = (repoString) => {
  if (!repoString) return null;
  const cleanString = repoString.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  const match = cleanString.match(/^([^/]+)\/([^/]+)$/);
  return match ? [match[1], match[2]] : null;
};

/** Determines the processing pipeline based on file extension. */
const getPipeline = (filePath) => {
  const { CONFIG, DOCS } = FILE_PATTERNS.EXTENSIONS;
  if (CONFIG.test(filePath)) return PROCESSING_PIPELINES.CONFIG;
  if (DOCS.test(filePath)) return PROCESSING_PIPELINES.MARKDOWN;
  return PROCESSING_PIPELINES.CODE;
};

// --- State Management ---
const INITIAL_STATE = {
  isLive: false,
  isAcknowledged: false,
  isIndexed: false,
  isComplete: false,
  status: 'IDLE',
  activePath: 'Ready',
  selectedModel: localStorage.getItem(APP_CONFIG.LOCAL_STORAGE_PREFIX + 'selectedModel') || AI_MODELS[0].id,
  targetRepo: localStorage.getItem(APP_CONFIG.LOCAL_STORAGE_PREFIX + 'targetRepo') || '',
  logs: [],
  metrics: { mutations: 0, steps: 0, errors: 0, progress: 0 }
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_VALUE': {
      const { key, value } = action.payload;
      if (PERSISTENCE_KEYS.has(key)) {
        localStorage.setItem(APP_CONFIG.LOCAL_STORAGE_PREFIX + key, value);
      }
      return { ...state, [key]: value };
    }
    case 'ACKNOWLEDGE':
      return { ...state, isAcknowledged: true };
    case 'TOGGLE_LIVE':
      const newIsLive = !state.isLive;
      return {
        ...state,
        isLive: newIsLive,
        status: newIsLive ? 'INITIALIZING' : 'IDLE',
        isComplete: false
      };
    case 'ADD_LOG':
      const newLog = { ...action.payload, id: Date.now() + Math.random() };
      return {
        ...state,
        logs: [newLog, ...state.logs].slice(0, APP_CONFIG.LOG_HISTORY_LIMIT)
      };
    case 'SET_STATUS':
      return { ...state, status: action.payload.value, activePath: action.payload.path || state.activePath };
    case 'UPDATE_METRICS': {
      const { mutations = 0, stepIncrement = 0, errors = 0, cursor, total } = action.payload;

      let progress = state.metrics.progress;
      if (typeof total === 'number' && total > 0 && typeof cursor === 'number') {
        progress = Math.min(100, Math.round((cursor / total) * 100));
      }

      return {
        ...state,
        metrics: {
          mutations: state.metrics.mutations + mutations,
          steps: state.metrics.steps + stepIncrement,
          errors: state.metrics.errors + errors,
          progress: progress
        }
      };
    }
    case 'RESET_SESSION':
      return { ...state, isIndexed: false, isComplete: false, metrics: INITIAL_STATE.metrics, status: 'IDLE', activePath: 'Ready' };
    case 'MARK_COMPLETE':
      return { ...state, isComplete: true, isIndexed: false, isLive: false, status: 'FINISHED', activePath: 'Queue Complete' };
    default:
      return state;
  }
}

// --- Custom Hooks ---

/** Handles Firebase initialization and authentication state. */
const useFirebaseSetup = (addLog) => {
  const [user, setUser] = useState(null);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const dbRef = useRef(null);
  const authRef = useRef(null);

  useEffect(() => {
    const initFirebase = async () => {
      try {
        if (typeof __firebase_config === 'undefined') {
          throw new Error("Firebase configuration not found.");
        }
        const firebaseConfig = JSON.parse(__firebase_config);
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);

        authRef.current = auth;
        dbRef.current = db;

        const initialToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        if (initialToken) {
          await signInWithCustomToken(auth, initialToken);
        } else {
          await signInAnonymously(auth);
        }

        const unsubscribe = onAuthStateChanged(auth, (u) => {
          setUser(u);
          setFirebaseReady(true);
        });

        return () => unsubscribe();

      } catch (e) {
        console.error("Firebase startup failed", e);
        addLog(`Firebase initialization failed: ${e.message}`, 'error');
        setFirebaseReady(true);
      }
    };
    initFirebase();
  }, [addLog]);

  return { dbRef, authRef, user, firebaseReady };
};

/** Encapsulates all external API interaction logic (Gemini and GitHub). */
const useApiHandlers = (state, dispatch, addLog, abortControllerRef) => {

  const getGithubHeaders = useCallback((token) => ({
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  }), []);

  const fetchFileContent = useCallback(async (owner, repo, filePath, token) => {
    const path = filePath.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = getGithubHeaders(token);

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`GH Fetch Error (${res.status}): ${errorData.message || res.statusText}`);
    }
    const data = await res.json();

    if (!data.content || !data.sha) {
      throw new Error("GitHub response missing content or SHA.");
    }

    return {
      content: decodeBase64(data.content),
      sha: data.sha
    };
  }, [getGithubHeaders]);

  const commitFileUpdate = useCallback(async (owner, repo, filePath, content, sha, token) => {
    const path = filePath.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = getGithubHeaders(token);

    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `[Sovereign] Sync: ${filePath}`,
        content: encodeBase64(content),
        sha
      })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`GH Commit Error (${res.status}): ${errorData.message || res.statusText}`);
    }
  }, [getGithubHeaders]);

  const callGeminiAPI = useCallback(async (prompt, personaText, modelId, apiKey) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
    const fullPrompt = `INSTRUCTION: ${personaText}\nOutput only transformed content. No markdown wrappers.\n\nFILE_CONTENT:\n${prompt}`;

    const payload = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "text/plain"
      }
    };

    for (let retryCount = 0; retryCount <= APP_CONFIG.MAX_API_RETRIES; retryCount++) {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.API_TIMEOUT_MS);

      try {
        if (!state.isLive) throw new Error("Operation halted by user.");

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          // Check for rate limiting (429) or other retryable errors
          if (res.status === 429 || res.status >= 500) {
            throw new Error(`API Status ${res.status}`, { cause: 'RETRYABLE' });
          }
          throw new Error(`API Status ${res.status}`, { cause: 'PERMANENT' });
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) throw new Error("Empty API Response or malformed structure.");

        // Robust cleanup of potential markdown wrappers (e.g., ```javascript\n...\n```)
        return text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();

      } catch (e) {
        clearTimeout(timeoutId);

        const isRetryable = e.name === 'AbortError' || e.message.includes('timeout') || e.cause === 'RETRYABLE';

        if (isRetryable && retryCount < APP_CONFIG.MAX_API_RETRIES && state.isLive) {
          const delay = Math.pow(2, retryCount) * 1000;
          addLog(`API Fault (Retryable), retrying in ${delay / 1000}s...`, 'warning');
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        // Re-throw if permanent or max retries reached
        throw e;
      }
    }
    throw new Error("Gemini API failed after all retries.");
  }, [state.isLive, addLog, abortControllerRef]);

  return { fetchFileContent, commitFileUpdate, callGeminiAPI, getGithubHeaders };
};

/** Manages the indexing, processing queue, and main execution loop. */
const useProcessingEngine = (state, dispatch, user, dbRef, ghTokenRef, geminiKeyRef, addLog, apiHandlers, abortControllerRef) => {
  const isProcessingRef = useRef(false);
  const queueRef = useRef([]);
  const currentIndexRef = useRef(0);

  const { fetchFileContent, commitFileUpdate, callGeminiAPI, getGithubHeaders } = apiHandlers;

  const processFile = useCallback(async (filePath, owner, repo, token, apiKey, modelId) => {
    const { content: initialContent, sha } = await fetchFileContent(owner, repo, filePath, token);
    let currentContent = initialContent;
    let mutated = false;

    const pipeline = getPipeline(filePath);

    for (const step of pipeline) {
      if (!state.isLive) break;
      dispatch({ type: 'SET_STATUS', payload: { value: 'SYNCING', path: filePath } });

      const processed = await callGeminiAPI(currentContent, step.text, modelId, apiKey);

      // Check if content changed significantly (length > 5 prevents trivial whitespace changes)
      if (processed && processed !== currentContent && processed.length > 5) {
        currentContent = processed;
        mutated = true;
      }
      dispatch({ type: 'UPDATE_METRICS', payload: { stepIncrement: 1 } });
    }

    if (mutated && state.isLive) {
      await commitFileUpdate(owner, repo, filePath, currentContent, sha, token);
      return { status: 'MUTATED', filePath };
    }
    return { status: 'SKIPPED', filePath };
  }, [state.isLive, dispatch, callGeminiAPI, fetchFileContent, commitFileUpdate]);

  const runCycle = useCallback(async () => {
    if (!state.isLive || isProcessingRef.current || !user || !state.isIndexed) return;
    isProcessingRef.current = true;

    const target = queueRef.current[currentIndexRef.current];

    if (!target) {
      addLog("All targets verified. Ready for new session.", "success");
      dispatch({ type: 'MARK_COMPLETE' });
      queueRef.current = [];
      currentIndexRef.current = 0;
      isProcessingRef.current = false;
      return;
    }

    try {
      const repoPath = parseRepoPath(state.targetRepo);
      if (!repoPath) throw new Error("Invalid repository path.");
      const [owner, repo] = repoPath;

      const result = await processFile(target, owner, repo, ghTokenRef.current, geminiKeyRef.current, state.selectedModel);

      const fileName = result.filePath.split('/').pop();
      if (result.status === 'MUTATED') {
        if (dbRef.current && user) {
          const docId = safeDocId(result.filePath);
          const docRef = doc(dbRef.current, 'artifacts', APP_CONFIG.APP_ID, 'users', user.uid, 'insights', docId);
          // Non-blocking Firestore write for metrics/history
          setDoc(docRef, { path: result.filePath, ts: serverTimestamp() }).catch(e => console.warn("Firestore write failed:", e.message));
        }
        addLog(`MUTATED: ${fileName}`, "success");
        dispatch({ type: 'UPDATE_METRICS', payload: { mutations: 1 } });
      } else {
        addLog(`VERIFIED: ${fileName}`, "info");
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        const targetPath = target || 'Unknown Target';
        addLog(`FAULT: ${targetPath.split('/').pop()} - ${e.message}`, "error");
        dispatch({ type: 'UPDATE_METRICS', payload: { errors: 1 } });
      }
    } finally {
      currentIndexRef.current++;
      dispatch({ type: 'UPDATE_METRICS', payload: { cursor: currentIndexRef.current, total: queueRef.current.length } });
      isProcessingRef.current = false;
      dispatch({ type: 'SET_STATUS', payload: { value: 'IDLE' } });
    }
  }, [state.isLive, state.targetRepo, state.selectedModel, state.isIndexed, user, addLog, processFile, dispatch, ghTokenRef, geminiKeyRef, dbRef]);

  const discover = useCallback(async () => {
    const repoPath = parseRepoPath(state.targetRepo);
    const ghToken = ghTokenRef.current;
    const geminiKey = geminiKeyRef.current;

    if (!repoPath || !ghToken || !geminiKey) {
      addLog("Repository path, GitHub Token, and Gemini Key are required.", "error");
      return;
    }

    dispatch({ type: 'SET_STATUS', payload: { value: 'INDEXING' } });
    const [owner, repo] = repoPath;
    const headers = getGithubHeaders(ghToken);

    try {
      // 1. Get default branch
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (!repoRes.ok) throw new Error(`Failed to access repository: ${repoRes.status}`);
      const repoData = await repoRes.json();
      const branch = repoData.default_branch || 'main';

      // 2. Get recursive tree
      const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers });
      if (!treeRes.ok) throw new Error(`Failed to fetch repository tree: ${treeRes.status}`);
      const treeData = await treeRes.json();

      const files = (treeData?.tree || [])
        .filter(f => f.type === 'blob' && f.size < APP_CONFIG.MAX_FILE_SIZE_BYTES)
        .filter(f => !FILE_PATTERNS.SKIP.some(p => p.test(f.path)))
        .filter(f => FILE_PATTERNS.EXTENSIONS.CODE.test(f.path) || FILE_PATTERNS.EXTENSIONS.CONFIG.test(f.path) || FILE_PATTERNS.EXTENSIONS.DOCS.test(f.path))
        .map(f => f.path);

      queueRef.current = files;
      currentIndexRef.current = 0;
      dispatch({ type: 'SET_VALUE', payload: { key: 'isIndexed', value: true } });
      addLog(`Indexed ${files.length} targets for synchronization.`, "success");
    } catch (e) {
      addLog(`Index Error: ${e.message}`, "error");
    } finally {
      dispatch({ type: 'SET_STATUS', payload: { value: 'IDLE' } });
    }
  }, [state.targetRepo, ghTokenRef, geminiKeyRef, addLog, dispatch, getGithubHeaders]);

  // Main Cycle Effect: Runs the processing loop
  useEffect(() => {
    if (!state.isLive) return;

    // Run immediately on activation
    runCycle();

    const timer = setInterval(runCycle, APP_CONFIG.CYCLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state.isLive, runCycle]);

  const handleMainButton = () => {
    if (state.isLive) {
      dispatch({ type: 'TOGGLE_LIVE' });
      if (abortControllerRef.current) abortControllerRef.current.abort();
      addLog("Operation halted by user.", "warning");
    } else if (state.isIndexed) {
      dispatch({ type: 'TOGGLE_LIVE' });
    } else {
      discover();
    }
  };

  return { handleMainButton };
};


// --- Main Application Component ---
export default function App() {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);

  // Refs for external dependencies and mutable state (keys are sensitive)
  const ghTokenRef = useRef('');
  const geminiKeyRef = useRef('');
  const abortControllerRef = useRef(null);

  const addLog = useCallback((msg, type = 'info') => {
    dispatch({ type: 'ADD_LOG', payload: { msg, type, timestamp: new Date().toLocaleTimeString([], { hour12: false }) } });
  }, [dispatch]);

  const { dbRef, user, firebaseReady } = useFirebaseSetup(addLog);

  const apiHandlers = useApiHandlers(state, dispatch, addLog, abortControllerRef);

  const { handleMainButton } = useProcessingEngine(
    state,
    dispatch,
    user,
    dbRef,
    ghTokenRef,
    geminiKeyRef,
    addLog,
    apiHandlers,
    abortControllerRef
  );

  // --- Render Logic ---

  if (!state.isAcknowledged) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8 text-white font-mono">
        <div className="max-w-md w-full p-12 rounded-[3rem] bg-zinc-950 border border-emerald-500/20 text-center">
          <div className="text-6xl mb-6">⚡</div>
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-2 italic">Sovereign <span className="text-emerald-500">Lite</span></h1>
          <p className="text-[10px] text-zinc-600 uppercase tracking-[0.5em] mb-12 font-bold italic">Flash Sync v86.25</p>
          <button onClick={() => dispatch({ type: 'ACKNOWLEDGE' })} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase text-[11px] tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all">Engage Core</button>
        </div>
      </div>
    );
  }

  if (!firebaseReady) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030303] text-zinc-300 p-4 md:p-10 font-mono">
      <div className="max-w-7xl mx-auto space-y-8">

        <header className="p-8 md:p-10 rounded-[3rem] bg-zinc-900/50 border border-white/5 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-8">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-3xl border transition-all duration-700 ${
              state.isLive
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 animate-pulse'
                : state.isComplete
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500'
                  : 'bg-zinc-800/20 text-zinc-600 border-zinc-700/50'
            }`}>
              {state.isLive ? '☄️' : state.isComplete ? '✅' : '🔘'}
            </div>
            <div>
              <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">Sovereign <span className="text-emerald-500">v86.25</span></h1>
              <div className="flex items-center gap-4 mt-1">
                <span className={`px-3 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${state.isLive ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>{state.status}</span>
                <span className="text-[10px] text-zinc-500 font-bold truncate max-w-[200px]">{state.activePath}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            {state.isComplete && !state.isLive && (
              <button onClick={() => dispatch({ type: 'RESET_SESSION' })} className="px-8 py-5 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-zinc-800 text-zinc-400 hover:text-white transition-all">Reset</button>
            )}
            <button
              onClick={handleMainButton}
              disabled={!user} // Disable if user is not authenticated (shouldn't happen if firebaseReady is true, but good safeguard)
              className={`px-14 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${state.isLive ? 'bg-red-600 text-white shadow-xl shadow-red-500/10' : state.isIndexed ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-500/10' : 'bg-white text-black hover:bg-zinc-200'}`}
            >
              {state.isLive ? 'Abort' : state.isIndexed ? 'Engage' : 'Initialize'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-4 space-y-8">
            <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] space-y-8">
              <div className="space-y-3">
                <label className="text-[11px] font-black text-zinc-600 uppercase tracking-widest">Vault (owner/repo)</label>
                <input
                  type="text"
                  value={state.targetRepo}
                  onChange={e => dispatch({ type: 'SET_VALUE', payload: { key: 'targetRepo', value: e.target.value } })}
                  disabled={state.isLive || state.isIndexed}
                  className={`w-full bg-black border border-white/5 rounded-xl p-5 text-[14px] text-white outline-none transition-all ${state.isLive || state.isIndexed ? 'opacity-40 cursor-not-allowed border-transparent' : 'focus:border-white/20'}`}
                  placeholder="user/repo"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[11px] font-black text-zinc-600 uppercase tracking-widest">GitHub Token</label>
                <input
                  type="password"
                  onChange={e => ghTokenRef.current = e.target.value.trim()}
                  disabled={state.isLive || state.isIndexed}
                  className={`w-full bg-black border border-white/5 rounded-xl p-5 text-[14px] text-white outline-none transition-all ${state.isLive || state.isIndexed ? 'opacity-40 cursor-not-allowed border-transparent' : 'focus:border-white/20'}`}
                  placeholder="ghp_..."
                />
              </div>
              <div className="space-y-3">
                <label className="text-[11px] font-black text-zinc-600 uppercase tracking-widest">Gemini Key</label>
                <input
                  type="password"
                  onChange={e => geminiKeyRef.current = e.target.value.trim()}
                  disabled={state.isLive || state.isIndexed}
                  className={`w-full bg-black border border-white/5 rounded-xl p-5 text-[14px] text-white outline-none transition-all ${state.isLive || state.isIndexed ? 'opacity-40 cursor-not-allowed border-transparent' : 'focus:border-white/20'}`}
                  placeholder="AIza..."
                />
              </div>
            </div>

            <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] space-y-4">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-zinc-600">Model Cluster</h2>
              {AI_MODELS.map(m => (
                <button key={m.id} onClick={() => dispatch({ type: 'SET_VALUE', payload: { key: 'selectedModel', value: m.id } })} disabled={state.isLive || state.isIndexed} className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${state.selectedModel === m.id ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-black/20 border-white/5 text-zinc-700'} ${state.isLive || state.isIndexed ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <span className="text-[10px] font-black uppercase">{m.label}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-3 gap-6">
              <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] text-center">
                <div className="text-3xl font-black mb-1 tabular-nums text-emerald-500">{state.metrics.mutations}</div>
                <div className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">Mutated</div>
              </div>
              <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] text-center relative overflow-hidden">
                <div className="text-3xl font-black mb-1 tabular-nums text-white">{state.metrics.progress}%</div>
                <div className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">Progress</div>
                <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-500" style={{ width: `${state.metrics.progress}%` }} />
              </div>
              <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] text-center">
                <div className="text-3xl font-black mb-1 tabular-nums text-red-500">{state.metrics.errors}</div>
                <div className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">Faults</div>
              </div>
            </div>

            <div className="h-[520px] bg-black border border-white/5 rounded-[3.5rem] flex flex-col overflow-hidden">
              <div className="px-10 py-6 border-b border-white/5 bg-zinc-900/10 flex justify-between">
                <span className="text-[12px] font-black text-emerald-500 uppercase tracking-widest">Telemetry</span>
                <span className="text-[10px] text-zinc-800 font-black">LITE.v86</span>
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-3 log-area">
                {state.logs.map(l => (
                  <div key={l.id} className="flex gap-6 text-[12px]">
                    <span className="text-zinc-800 font-bold shrink-0">{l.timestamp}</span>
                    <span className={`font-medium ${l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-emerald-400' : l.type === 'warning' ? 'text-yellow-400' : 'text-zinc-400'}`}>{l.msg}</span>
                  </div>
                ))}
                {state.logs.length === 0 && <div className="text-zinc-700 italic text-[12px]">Awaiting system initialization...</div>}
              </div>
            </div>
          </main>
        </div>
      </div>
      <style>{`.log-area::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
          }
