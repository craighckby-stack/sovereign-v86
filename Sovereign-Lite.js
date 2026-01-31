import React, { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, writeBatch, query, onSnapshot,
  serverTimestamp, limit, doc, setDoc
} from 'firebase/firestore';
import {
  getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged
} from 'firebase/auth';

// --- Configuration Constants ---
const CONFIG = Object.freeze({
  MAX_FILE_SIZE_BYTES: 1_000_000, 
  CYCLE_INTERVAL_MS: 15_000,   
  MAX_API_RETRIES: 5,
  LOCAL_STORAGE_PREFIX: 'emg_v86_',
  LOG_HISTORY_LIMIT: 60,
  APP_ID: typeof __app_id !== 'undefined' ? __app_id : 'emg-v86-sovereign',
});

const MODELS = Object.freeze([
  { id: 'gemini-2.5-flash-preview-09-2025', label: 'Flash 2.5 Preview (Default)', tier: 1 },
  { id: 'gemini-1.5-flash', label: 'Flash 1.5 Stable', tier: 2 }
]);

const PIPELINES = Object.freeze({
  CODE: [{ id: 'refactor', label: 'Refactor', text: 'Act as a Senior Software Engineer. Improve the logic of the provided code. CRITICAL: You must return ONLY the raw source code. Do not include markdown commentary, do not include hashtags, and do not include todo lists in the response. If you have "thoughts" or "plans", ignore them and only output the code.' }],
  CONFIG: [{ id: 'validate', label: 'Lint', text: 'Act as a DevOps Engineer. Optimize configurations. Return only valid config format.' }],
  DOCS: [{ id: 'clarify', label: 'Editor', text: 'Act as a Technical Writer. Improve documentation.' }]
});

const FILE_EXTENSIONS = Object.freeze({
  CODE: /\.(js|jsx|ts|tsx|py|html|css|scss|sql|sh|java|go|rs|rb|php|cpp|c|h)$/i,
  CONFIG: /\.(json|yaml|yml|toml|ini)$/i,
  DOCS: /\.(md|txt|rst|adoc|text)$/i
});

const SKIP_PATTERNS = Object.freeze([
  /node_modules\//, /\.min\./, /-lock\./, /dist\//, /build\//, /\.git\//, /\.log$/
]);

const TODO_FILE_NAMES = ['.sovereign-instructions.md', 'sovereign-todo.md', 'instructions.md'];

const PERSIST_KEYS = new Set(['selectedModel', 'targetRepo']);

// --- Utility Functions ---
const decodeBase64 = (str) => {
  try {
    const binaryString = atob(str);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (e) { throw new Error(`Decode failure`); }
};

const encodeBase64 = (str) => {
  try {
    const bytes = new TextEncoder().encode(str);
    const binaryString = String.fromCodePoint(...bytes);
    return btoa(binaryString);
  } catch (e) { return ''; }
};

const parseRepoPath = (repoString) => {
  if (!repoString) return null;
  const cleanString = repoString.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  const match = cleanString.match(/^([^/]+)\/([^/]+)$/);
  return match ? [match[1], match[2]] : null;
};

const getPipeline = (filePath) => {
  if (FILE_EXTENSIONS.CONFIG.test(filePath)) return PIPELINES.CONFIG;
  if (FILE_EXTENSIONS.DOCS.test(filePath)) return PIPELINES.DOCS;
  return PIPELINES.CODE;
};

// --- State Management ---
const initialState = {
  isLive: false,
  isAcknowledged: false,
  isIndexed: false,
  isComplete: false,
  status: 'IDLE',
  activePath: 'Ready',
  selectedModel: localStorage.getItem(CONFIG.LOCAL_STORAGE_PREFIX + 'selectedModel') || MODELS[0].id,
  targetRepo: localStorage.getItem(CONFIG.LOCAL_STORAGE_PREFIX + 'targetRepo') || '',
  logs: [],
  metrics: { mutations: 0, steps: 0, errors: 0, progress: 0 }
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_VAL':
      if (PERSIST_KEYS.has(action.key)) localStorage.setItem(CONFIG.LOCAL_STORAGE_PREFIX + action.key, action.value);
      return { ...state, [action.key]: action.value };
    case 'ACKNOWLEDGE': return { ...state, isAcknowledged: true };
    case 'TOGGLE_LIVE': return { ...state, isLive: !state.isLive, status: !state.isLive ? 'INITIALIZING' : 'IDLE', isComplete: false };
    case 'ADD_LOG': return { ...state, logs: [{ ...action.payload, id: Date.now() + Math.random() }, ...state.logs].slice(0, CONFIG.LOG_HISTORY_LIMIT) };
    case 'SET_STATUS': return { ...state, status: action.value, activePath: action.path || state.activePath };
    case 'UPDATE_METRICS': {
      const { m = 0, stepIncr = 0, e = 0, cursor, total } = action;
      const progress = (total > 0) ? Math.min(100, Math.round((cursor / total) * 100)) : state.metrics.progress;
      return { ...state, metrics: { mutations: state.metrics.mutations + m, steps: state.metrics.steps + stepIncr, errors: state.metrics.errors + e, progress: progress } };
    }
    case 'RESET_SESSION': return { ...state, isIndexed: false, isComplete: false, metrics: initialState.metrics, status: 'IDLE', activePath: 'Ready' };
    case 'MARK_COMPLETE': return { ...state, isComplete: true, isIndexed: false, isLive: false, status: 'FINISHED', activePath: 'Queue Complete' };
    default: return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [user, setUser] = useState(null);
  const [firebaseReady, setFirebaseReady] = useState(false);

  const ghTokenRef = useRef('');
  const geminiKeyRef = useRef('');
  const projectContextRef = useRef('');
  const readmeDataRef = useRef({ path: '', sha: '', content: '' });
  const customInstructionsRef = useRef('');
  const todoFileRef = useRef({ path: '', sha: '', content: '' });
  const isProcessingRef = useRef(false);
  const queueRef = useRef([]);
  const currentIndexRef = useRef(0);
  const abortControllerRef = useRef(null);

  const addLog = useCallback((msg, type = 'info') => {
    dispatch({ type: 'ADD_LOG', payload: { msg, type, timestamp: new Date().toLocaleTimeString([], { hour12: false }) } });
  }, []);

  // Firebase Initialization
  useEffect(() => {
    let isMounted = true;
    const initFirebase = async () => {
      const forceReady = setTimeout(() => { if (isMounted) setFirebaseReady(true); }, 4000);
      try {
        if (typeof __firebase_config === 'undefined') throw new Error();
        const firebaseConfig = JSON.parse(__firebase_config);
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
        onAuthStateChanged(auth, (u) => { if (isMounted) { setUser(u); setFirebaseReady(true); clearTimeout(forceReady); }});
      } catch (e) { if (isMounted) { setFirebaseReady(true); clearTimeout(forceReady); }}
    };
    initFirebase();
    return () => { isMounted = false; };
  }, []);

  const callGeminiAPI = useCallback(async (prompt, personaText, modelId, apiKey, context = '', instructions = '', retryCount = 0) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ 
        parts: [{ 
          text: `
            SYSTEM_CONTEXT: ${context}
            USER_TODO_LIST: ${instructions}
            AGENT_ROLE: ${personaText}
            
            INPUT_DATA_TO_PROCESS:
            ${prompt}
          ` 
        }] 
      }],
      generationConfig: { temperature: 0.1, responseMimeType: "text/plain" }
    };

    abortControllerRef.current = new AbortController();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal
      });
      if (!res.ok) throw new Error(`API: ${res.status}`);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty Response");
      return text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
    } catch (e) {
      if (e.name !== 'AbortError' && retryCount < CONFIG.MAX_API_RETRIES && state.isLive) {
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(r => setTimeout(r, delay));
        return callGeminiAPI(prompt, personaText, modelId, apiKey, context, instructions, retryCount + 1);
      }
      throw e;
    }
  }, [state.isLive]);

  const updateTodoAndPlan = async (owner, repo, token, apiKey, modelId, fileProcessed, codeSummary) => {
    if (!todoFileRef.current.path) return;
    
    // Mode: Update Roadmap
    const prompt = `
      Act as a Project Manager. Update the Markdown TODO list.
      File just changed: "${fileProcessed}"
      Change Summary: ${codeSummary}
      
      Current List:
      ${todoFileRef.current.content || "Empty"}
      
      Output the updated Markdown list ONLY.
    `;

    try {
      const updatedMarkdown = await callGeminiAPI(prompt, "Project Management Mode", modelId, apiKey);
      if (updatedMarkdown && updatedMarkdown.includes('#')) {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${todoFileRef.current.path}`;
        const putRes = await fetch(url, {
          method: 'PUT',
          headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `[Sovereign] Roadmap Update: ${fileProcessed}`,
            content: encodeBase64(updatedMarkdown),
            sha: todoFileRef.current.sha
          })
        });
        if (putRes.ok) {
          const resData = await putRes.json();
          todoFileRef.current.content = updatedMarkdown;
          todoFileRef.current.sha = resData.content.sha;
          addLog("Roadmap Updated Successfully", "success");
        }
      }
    } catch (e) { addLog("Roadmap sync failed", "warning"); }
  };

  const processFile = async (filePath, owner, repo, token, apiKey, modelId) => {
    const fileName = filePath.toLowerCase().split('/').pop();
    const isTodo = TODO_FILE_NAMES.includes(fileName);
    const path = filePath.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };

    const res = await fetch(url, { headers });
    const data = await res.json();
    let content = decodeBase64(data.content);
    const sha = data.sha;

    if (isTodo) {
      customInstructionsRef.current = content;
      todoFileRef.current = { path: filePath, sha, content };
      addLog(`Mastered Tasks: ${fileName}`, "success");
      return { status: 'SKIPPED' };
    }
    
    if (fileName === 'readme.md') {
      projectContextRef.current = content.slice(0, 3000);
      readmeDataRef.current = { path: filePath, sha, content };
      return { status: 'SKIPPED' };
    }

    const pipeline = getPipeline(filePath);
    let currentContent = content;
    let mutated = false;

    for (const step of pipeline) {
      if (!state.isLive) break;
      dispatch({ type: 'SET_STATUS', value: 'EVOLVING', path: filePath });
      const processed = await callGeminiAPI(currentContent, step.text, modelId, apiKey, projectContextRef.current, customInstructionsRef.current);
      
      // CRITICAL GUARD: Check for "Markdown Spillover" in Code files
      const isCode = FILE_EXTENSIONS.CODE.test(filePath);
      if (isCode && (processed.includes('##') || processed.includes('Act as a'))) {
        addLog(`Blocked Invalid Output for ${fileName} (Spillover Detected)`, "error");
        continue; 
      }

      if (processed && processed !== currentContent && processed.length < CONFIG.MAX_FILE_SIZE_BYTES) {
        currentContent = processed;
        mutated = true;
      }
      dispatch({ type: 'UPDATE_METRICS', stepIncr: 1 });
    }

    if (mutated && state.isLive) {
      const putRes = await fetch(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `[Sovereign] Logic Evolution: ${filePath}`, content: encodeBase64(currentContent), sha })
      });
      if (putRes.ok) {
        // Only trigger the roadmap update AFTER the file is successfully committed
        await updateTodoAndPlan(owner, repo, token, apiKey, modelId, filePath, "Applied architectural refactoring.");
        return { status: 'MUTATED' };
      }
    }
    return { status: 'SKIPPED' };
  };

  const runCycle = useCallback(async () => {
    if (!state.isLive || isProcessingRef.current || !state.isIndexed) return;
    isProcessingRef.current = true;
    const target = queueRef.current[currentIndexRef.current];
    const repoPath = parseRepoPath(state.targetRepo);
    const [owner, repo] = repoPath;
    
    if (!target) {
      dispatch({ type: 'MARK_COMPLETE' });
      isProcessingRef.current = false;
      return;
    }

    try {
      const result = await processFile(target, owner, repo, ghTokenRef.current, geminiKeyRef.current, state.selectedModel);
      if (result.status === 'MUTATED') {
        addLog(`MUTATED: ${target.split('/').pop()}`, "success");
        dispatch({ type: 'UPDATE_METRICS', m: 1 });
      } else {
        addLog(`SCAN: ${target.split('/').pop()}`, "info");
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        addLog(`FAULT: ${target.split('/').pop()}`, "error");
        dispatch({ type: 'UPDATE_METRICS', e: 1 });
      }
    } finally {
      currentIndexRef.current++;
      dispatch({ type: 'UPDATE_METRICS', cursor: currentIndexRef.current, total: queueRef.current.length });
      isProcessingRef.current = false;
      dispatch({ type: 'SET_STATUS', value: 'IDLE', path: 'Neural Standby' });
    }
  }, [state.isLive, state.targetRepo, state.selectedModel, state.isIndexed, addLog]);

  useEffect(() => {
    if (!state.isLive) return;
    const timer = setInterval(runCycle, CONFIG.CYCLE_INTERVAL_MS);
    runCycle();
    return () => clearInterval(timer);
  }, [state.isLive, runCycle]);

  const discover = async () => {
    const repoPath = parseRepoPath(state.targetRepo);
    if (!repoPath || !ghTokenRef.current || !geminiKeyRef.current) return;
    dispatch({ type: 'SET_STATUS', value: 'INDEXING' });
    try {
      const [owner, repo] = repoPath;
      const headers = { 'Authorization': `token ${ghTokenRef.current}`, 'Accept': 'application/vnd.github.v3+json' };
      const rRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      const rData = await rRes.json();
      const tRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${rData.default_branch || 'main'}?recursive=1`, { headers });
      const tData = await tRes.json();
      
      let files = (tData?.tree || []).filter(f => f.type === 'blob' && f.size < CONFIG.MAX_FILE_SIZE_BYTES && !SKIP_PATTERNS.some(p => p.test(f.path)) && (FILE_EXTENSIONS.CODE.test(f.path) || FILE_EXTENSIONS.CONFIG.test(f.path) || FILE_EXTENSIONS.DOCS.test(f.path))).map(f => f.path);
      
      files.sort((a, b) => {
        const aL = a.toLowerCase().split('/').pop();
        const bL = b.toLowerCase().split('/').pop();
        if (TODO_FILE_NAMES.includes(aL)) return -1;
        if (TODO_FILE_NAMES.includes(bL)) return 1;
        if (aL === 'readme.md') return -1;
        return 0;
      });

      queueRef.current = files;
      currentIndexRef.current = 0;
      dispatch({ type: 'SET_VAL', key: 'isIndexed', value: true });
      addLog(`Indexed ${files.length} Target Files`, "success");
    } catch (e) { addLog(`Indexing Failed`, "error"); }
    finally { dispatch({ type: 'SET_STATUS', value: 'IDLE' }); }
  };

  if (!state.isAcknowledged) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8 text-white font-mono">
        <div className="max-w-md w-full p-12 rounded-[3rem] bg-zinc-950 border border-emerald-500/20 text-center">
          <div className="text-6xl mb-6">🛰️</div>
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-2 italic">Sovereign <span className="text-emerald-500">Lite</span></h1>
          <p className="text-[10px] text-zinc-600 uppercase tracking-[0.5em] mb-12 font-bold italic">Boundary Control v86.40</p>
          <button onClick={() => dispatch({ type: 'ACKNOWLEDGE' })} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase text-[11px] tracking-widest transition-all">Engage</button>
        </div>
      </div>
    );
  }

  if (!firebaseReady) return <div className="min-h-screen bg-black flex items-center justify-center font-mono text-zinc-800 tracking-widest text-[10px]">SYNCING_CHANNELS...</div>;

  return (
    <div className="min-h-screen bg-[#020202] text-zinc-300 p-4 md:p-10 font-mono text-[13px]">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="p-10 rounded-[3rem] bg-zinc-900/50 border border-white/5 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-8">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-3xl border transition-all ${state.isLive ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 animate-pulse' : 'bg-zinc-800/20 text-zinc-600 border-zinc-700/50'}`}>{state.isLive ? '🦾' : '🔘'}</div>
            <div>
              <h1 className="text-2xl font-black text-white uppercase italic">Sovereign <span className="text-emerald-500 text-sm">v86.40</span></h1>
              <div className="flex items-center gap-4 mt-1">
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${state.isLive ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>{state.status}</span>
                <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">{state.activePath}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={() => { if (state.isLive) { dispatch({ type: 'TOGGLE_LIVE' }); abortControllerRef.current?.abort(); } else if (state.isIndexed) dispatch({ type: 'TOGGLE_LIVE' }); else discover(); }} className={`px-14 py-5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${state.isLive ? 'bg-red-600 text-white' : state.isIndexed ? 'bg-emerald-600 text-white' : 'bg-white text-black hover:bg-zinc-200'}`}>{state.isLive ? 'Stop' : state.isIndexed ? 'Run' : 'Sync'}</button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-4 space-y-8">
             <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] space-y-6">
              <div className="space-y-2"><label className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Vault (owner/repo)</label><input type="text" value={state.targetRepo} onChange={e => dispatch({ type: 'SET_VAL', key: 'targetRepo', value: e.target.value })} disabled={state.isLive || state.isIndexed} className="w-full bg-black border border-white/5 rounded-xl p-4 text-white outline-none font-bold" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Auth Secret</label><input type="password" onChange={e => ghTokenRef.current = e.target.value} disabled={state.isLive || state.isIndexed} className="w-full bg-black border border-white/5 rounded-xl p-4 text-white outline-none" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Gemini Key</label><input type="password" onChange={e => geminiKeyRef.current = e.target.value} disabled={state.isLive || state.isIndexed} className="w-full bg-black border border-white/5 rounded-xl p-4 text-white outline-none" /></div>
            </div>
          </aside>
          <main className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-3 gap-6 text-center">
              <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem]"><div className="text-3xl font-black text-emerald-500">{state.metrics.mutations}</div><div className="text-[9px] font-black uppercase text-zinc-600">Mutations</div></div>
              <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] relative overflow-hidden"><div className="text-3xl font-black text-white">{state.metrics.progress}%</div><div className="text-[9px] font-black uppercase text-zinc-600">Cycle</div><div className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all" style={{ width: `${state.metrics.progress}%` }} /></div>
              <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem]"><div className="text-3xl font-black text-red-500">{state.metrics.errors}</div><div className="text-[9px] font-black uppercase text-zinc-600">Spillovers</div></div>
            </div>
            <div className="h-[400px] bg-black border border-white/5 rounded-[3rem] flex flex-col overflow-hidden">
              <div className="p-6 border-b border-white/5 bg-zinc-900/10 text-[10px] font-black uppercase tracking-widest text-zinc-500">Neural Log</div>
              <div className="flex-1 overflow-y-auto p-10 space-y-2 text-[12px] log-area scroll-smooth">
                {state.logs.map(l => <div key={l.id} className="flex gap-4"><span className="text-zinc-800 font-bold shrink-0">{l.timestamp}</span><span className={l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-emerald-400' : 'text-zinc-500'}>{l.msg}</span></div>)}
              </div>
            </div>
          </main>
        </div>
      </div>
      <style>{`.log-area::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
  }
