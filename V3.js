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
  MAX_API_RETRIES: 3,
  API_TIMEOUT_MS: 60_000, 
  LOCAL_STORAGE_PREFIX: 'emg_v86_',
  LOG_HISTORY_LIMIT: 60,
  APP_ID: typeof __app_id !== 'undefined' ? __app_id : 'emg-v86-sovereign',
});

const MODELS = Object.freeze([
  { id: 'gemini-2.5-flash-preview-09-2025', label: 'Flash 2.5 Preview (Default)', tier: 1 },
  { id: 'gemini-1.5-flash', label: 'Flash 1.5 Stable', tier: 2 }
]);

const PIPELINES = Object.freeze({
  CODE: [{ id: 'refactor', label: 'Refactor', text: 'Act as a Principal Software Architect. Use project context and the provided CUSTOM INSTRUCTIONS to improve code. Output ONLY raw code.' }],
  CONFIG: [{ id: 'validate', label: 'Lint', text: 'Act as a DevOps Engineer. Use CUSTOM INSTRUCTIONS to optimize configuration.' }],
  DOCS: [{ id: 'clarify', label: 'Editor', text: 'Act as a Technical Writer. Follow CUSTOM INSTRUCTIONS to improve documentation.' }]
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
    const payload = {
      contents: [{ 
        parts: [{ 
          text: `
            PROJECT_OVERVIEW: ${context}
            USER_INSTRUCTIONS: ${instructions || "Follow standard best practices."}
            AGENT_ROLE: ${personaText}
            
            TARGET_CONTENT:
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
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal
      });
      if (!res.ok) throw new Error(`API failure`);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
    } catch (e) {
      if (e.name !== 'AbortError' && retryCount < CONFIG.MAX_API_RETRIES && state.isLive) {
        await new Promise(r => setTimeout(r, 2000));
        return callGeminiAPI(prompt, personaText, modelId, apiKey, context, instructions, retryCount + 1);
      }
      throw e;
    }
  }, [state.isLive]);

  const updateTodoStatus = async (owner, repo, token, apiKey, modelId, completedFile) => {
    if (!todoFileRef.current.path) return;
    
    const prompt = `
      The following file was just refactored/improved: "${completedFile}".
      Update the following TODO list by checking off (changing [ ] to [x]) any tasks that relate to this file or the work done.
      If no specific task matches, do not change anything.
      Output ONLY the full updated markdown content of the TODO list.
      
      TODO LIST CONTENT:
      ${todoFileRef.current.content}
    `;

    try {
      const updatedContent = await callGeminiAPI(prompt, "Act as a Project Coordinator. Mark tasks as complete.", modelId, apiKey);
      if (updatedContent && updatedContent !== todoFileRef.current.content) {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${todoFileRef.current.path}`;
        const putRes = await fetch(url, {
          method: 'PUT',
          headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `[Sovereign] Task Check-off: ${completedFile}`,
            content: encodeBase64(updatedContent),
            sha: todoFileRef.current.sha
          })
        });
        if (putRes.ok) {
          const resData = await putRes.json();
          todoFileRef.current.content = updatedContent;
          todoFileRef.current.sha = resData.content.sha;
          addLog(`Updated TODO list for ${completedFile.split('/').pop()}`, "success");
        }
      }
    } catch (e) {
      addLog("Failed to update TODO list", "warning");
    }
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
      addLog(`Mastering Task List: ${fileName}`, "success");
      return { status: 'SKIPPED', filePath };
    }
    
    if (fileName === 'readme.md') {
      projectContextRef.current = content.slice(0, 6000);
      return { status: 'SKIPPED', filePath };
    }

    const pipeline = getPipeline(filePath);
    let mutated = false;

    for (const step of pipeline) {
      if (!state.isLive) break;
      dispatch({ type: 'SET_STATUS', value: 'SYNCING', path: filePath });
      const processed = await callGeminiAPI(content, step.text, modelId, apiKey, projectContextRef.current, customInstructionsRef.current);
      
      if (processed && processed !== content && processed.length < CONFIG.MAX_FILE_SIZE_BYTES) {
        content = processed;
        mutated = true;
      }
      dispatch({ type: 'UPDATE_METRICS', stepIncr: 1 });
    }

    if (mutated && state.isLive) {
      const putRes = await fetch(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `[Sovereign] Refactor: ${filePath}`, content: encodeBase64(content), sha })
      });
      if (putRes.ok) {
        await updateTodoStatus(owner, repo, token, apiKey, modelId, filePath);
        return { status: 'MUTATED', filePath };
      }
      throw new Error("Commit Fail");
    }
    return { status: 'SKIPPED', filePath };
  };

  const runCycle = useCallback(async () => {
    if (!state.isLive || isProcessingRef.current || !state.isIndexed) return;
    isProcessingRef.current = true;
    const target = queueRef.current[currentIndexRef.current];
    
    if (!target) {
      dispatch({ type: 'MARK_COMPLETE' });
      isProcessingRef.current = false;
      return;
    }

    try {
      const repoPath = parseRepoPath(state.targetRepo);
      const [owner, repo] = repoPath;
      const result = await processFile(target, owner, repo, ghTokenRef.current, geminiKeyRef.current, state.selectedModel);
      const name = target.split('/').pop();
      if (result.status === 'MUTATED') {
        addLog(`EVOLVED: ${name}`, "success");
        dispatch({ type: 'UPDATE_METRICS', m: 1 });
      } else {
        addLog(`SCANNED: ${name}`, "info");
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
      dispatch({ type: 'SET_STATUS', value: 'IDLE', path: 'Standby' });
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
        const aIsInst = TODO_FILE_NAMES.includes(aL);
        const bIsInst = TODO_FILE_NAMES.includes(bL);
        const aIsReadme = aL === 'readme.md';
        const bIsReadme = bL === 'readme.md';

        if (aIsInst && !bIsInst) return -1;
        if (!aIsInst && bIsInst) return 1;
        if (aIsReadme && !bIsReadme) return -1;
        if (!aIsReadme && bIsReadme) return 1;
        return 0;
      });

      queueRef.current = files;
      currentIndexRef.current = 0;
      dispatch({ type: 'SET_VAL', key: 'isIndexed', value: true });
      addLog(`Self-Audit Complete: ${files.length} paths queued`, "success");
    } catch (e) { addLog(`Discovery Error`, "error"); }
    finally { dispatch({ type: 'SET_STATUS', value: 'IDLE' }); }
  };

  if (!state.isAcknowledged) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8 text-white font-mono">
        <div className="max-w-md w-full p-12 rounded-[3rem] bg-zinc-950 border border-emerald-500/20 text-center">
          <div className="text-6xl mb-6">🏁</div>
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-2 italic">Sovereign <span className="text-emerald-500">Lite</span></h1>
          <p className="text-[10px] text-zinc-600 uppercase tracking-[0.5em] mb-12 font-bold italic">Progress-Sync v86.34</p>
          <button onClick={() => dispatch({ type: 'ACKNOWLEDGE' })} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase text-[11px] tracking-widest transition-all">Engage</button>
        </div>
      </div>
    );
  }

  if (!firebaseReady) return <div className="min-h-screen bg-black flex items-center justify-center font-mono text-zinc-800 tracking-widest text-[10px]">SYNCING_CHANNELS...</div>;

  return (
    <div className="min-h-screen bg-[#030303] text-zinc-300 p-4 md:p-10 font-mono text-[13px]">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="p-10 rounded-[3rem] bg-zinc-900/50 border border-white/5 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-8">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-3xl border transition-all ${state.isLive ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 animate-pulse' : 'bg-zinc-800/20 text-zinc-600 border-zinc-700/50'}`}>{state.isLive ? '🎯' : '🔘'}</div>
            <div>
              <h1 className="text-2xl font-black text-white uppercase italic">Sovereign <span className="text-emerald-500">v86.34</span></h1>
              <div className="flex items-center gap-4 mt-1">
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${state.isLive ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>{state.status}</span>
                <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">{state.activePath}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            {state.isComplete && !state.isLive && <button onClick={() => dispatch({ type: 'RESET_SESSION' })} className="px-8 py-5 rounded-2xl text-[11px] font-black uppercase bg-zinc-800 text-zinc-400 hover:text-white transition-all">Reset</button>}
            <button onClick={() => { if (state.isLive) { dispatch({ type: 'TOGGLE_LIVE' }); abortControllerRef.current?.abort(); } else if (state.isIndexed) dispatch({ type: 'TOGGLE_LIVE' }); else discover(); }} className={`px-14 py-5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${state.isLive ? 'bg-red-600 text-white' : state.isIndexed ? 'bg-emerald-600 text-white' : 'bg-white text-black hover:bg-zinc-200'}`}>{state.isLive ? 'Abort' : state.isIndexed ? 'Engage' : 'Initialize'}</button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-4 space-y-8">
            <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] space-y-6">
              <div className="space-y-2"><label className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Vault (owner/repo)</label><input type="text" value={state.targetRepo} onChange={e => dispatch({ type: 'SET_VAL', key: 'targetRepo', value: e.target.value })} disabled={state.isLive || state.isIndexed} className="w-full bg-black border border-white/5 rounded-xl p-4 text-white outline-none" placeholder="owner/repo" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Auth Secret</label><input type="password" onChange={e => ghTokenRef.current = e.target.value} disabled={state.isLive || state.isIndexed} className="w-full bg-black border border-white/5 rounded-xl p-4 text-white outline-none" placeholder="ghp_..." /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Gemini Key</label><input type="password" onChange={e => geminiKeyRef.current = e.target.value} disabled={state.isLive || state.isIndexed} className="w-full bg-black border border-white/5 rounded-xl p-4 text-white outline-none" placeholder="AIza..." /></div>
            </div>
            <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] space-y-4">
              {MODELS.map(m => <button key={m.id} onClick={() => dispatch({ type: 'SET_VAL', key: 'selectedModel', value: m.id })} disabled={state.isLive || state.isIndexed} className={`w-full p-4 rounded-xl border text-[10px] font-black uppercase text-left transition-all ${state.selectedModel === m.id ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-black/20 border-white/5 text-zinc-700'}`}>{m.label}</button>)}
            </div>
          </aside>
          <main className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-3 gap-6">
              <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] text-center"><div className="text-3xl font-black text-emerald-500">{state.metrics.mutations}</div><div className="text-[9px] font-black uppercase text-zinc-600">Evolved</div></div>
              <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] text-center relative overflow-hidden"><div className="text-3xl font-black text-white">{state.metrics.progress}%</div><div className="text-[9px] font-black uppercase text-zinc-600">Pipeline</div><div className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all" style={{ width: `${state.metrics.progress}%` }} /></div>
              <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] text-center"><div className="text-3xl font-black text-red-500">{state.metrics.errors}</div><div className="text-[9px] font-black uppercase text-zinc-600">Faults</div></div>
            </div>
            <div className="h-[500px] bg-black border border-white/5 rounded-[3rem] flex flex-col overflow-hidden">
              <div className="p-6 border-b border-white/5 bg-zinc-900/10 flex justify-between items-center">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Neural Link Activity</span>
                {todoFileRef.current.path && <span className="text-[8px] bg-emerald-500 text-black px-2 py-0.5 rounded font-black animate-pulse">AUTONOMOUS REPORTING ACTIVE</span>}
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-2 text-[12px] log-area scroll-smooth">
                {state.logs.map(l => <div key={l.id} className="flex gap-4 animate-in fade-in slide-in-from-left-2"><span className="text-zinc-800 font-bold shrink-0">{l.timestamp}</span><span className={l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-emerald-400' : l.type === 'warning' ? 'text-yellow-400' : 'text-zinc-500'}>{l.msg}</span></div>)}
                {state.logs.length === 0 && <div className="text-zinc-800 uppercase italic text-[10px]">Awaiting Uplink...</div>}
              </div>
            </div>
          </main>
        </div>
      </div>
      <style>{`.log-area::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
        }
