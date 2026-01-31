import React, { useState, useEffect, useReducer, useRef, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// --- Configuration & Constants ---

/**
 * Retrieves global configuration likely injected during build.
 * Ensures safe access to potentially undefined global variables.
 */
const getGlobalConfig = () => ({
  APP_ID: typeof __app_id !== 'undefined' ? __app_id : 'emg-v86-sovereign',
  FIREBASE_CONFIG: typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null,
  INITIAL_AUTH_TOKEN: typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null,
});

const CONFIG = Object.freeze({
  MAX_FILE_SIZE_BYTES: 1_000_000, 
  CYCLE_INTERVAL_MS: 15_000,   
  MAX_API_RETRIES: 5,
  LOCAL_STORAGE_PREFIX: 'emg_v86_',
  LOG_HISTORY_LIMIT: 60,
  GITHUB_API_BASE: 'https://api.github.com',
  GEMINI_API_BASE: 'https://generativelanguage.googleapis.com/v1beta',
  ...getGlobalConfig()
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

const TODO_FILE_NAMES = Object.freeze(['.sovereign-instructions.md', 'sovereign-todo.md', 'instructions.md']);

const PERSIST_KEYS = new Set(['selectedModel', 'targetRepo']);

// --- Utility Functions ---

const base64Decode = (str) => {
  try {
    const binaryString = atob(str);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error("Base64 Decode failure:", e);
    throw new Error(`Base64 Decode failure`);
  }
};

const base64Encode = (str) => {
  try {
    const bytes = new TextEncoder().encode(str);
    const binaryString = String.fromCodePoint(...bytes);
    return btoa(binaryString);
  } catch (e) {
    return '';
  }
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

// --- State Management: Reducer & Initial State ---

const ACTION_TYPES = {
  SET_VALUE: 'SET_VALUE',
  ACKNOWLEDGE: 'ACKNOWLEDGE',
  TOGGLE_LIVE: 'TOGGLE_LIVE',
  ADD_LOG: 'ADD_LOG',
  SET_STATUS: 'SET_STATUS',
  UPDATE_METRICS: 'UPDATE_METRICS',
  RESET_SESSION: 'RESET_SESSION',
  MARK_COMPLETE: 'MARK_COMPLETE',
};

const initialMetrics = { mutations: 0, steps: 0, errors: 0, progress: 0 };

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
  metrics: initialMetrics
};

function reducer(state, action) {
  switch (action.type) {
    case ACTION_TYPES.SET_VALUE:
      if (PERSIST_KEYS.has(action.key)) {
        localStorage.setItem(CONFIG.LOCAL_STORAGE_PREFIX + action.key, action.value);
      }
      return { ...state, [action.key]: action.value };

    case ACTION_TYPES.ACKNOWLEDGE:
      return { ...state, isAcknowledged: true };

    case ACTION_TYPES.TOGGLE_LIVE:
      const newLive = !state.isLive;
      return { 
        ...state, 
        isLive: newLive, 
        status: newLive ? (state.isIndexed ? 'INITIALIZING' : 'READY') : 'IDLE', 
        isComplete: false 
      };

    case ACTION_TYPES.ADD_LOG:
      const newLog = { ...action.payload, id: Date.now() + Math.random() };
      return { 
        ...state, 
        logs: [newLog, ...state.logs].slice(0, CONFIG.LOG_HISTORY_LIMIT) 
      };

    case ACTION_TYPES.SET_STATUS:
      return { ...state, status: action.value, activePath: action.path || state.activePath };

    case ACTION_TYPES.UPDATE_METRICS: {
      const { m = 0, stepIncr = 0, e = 0, cursor, total } = action;
      const progress = (total > 0 && cursor !== undefined) 
        ? Math.min(100, Math.round((cursor / total) * 100)) 
        : state.metrics.progress;
      
      return { 
        ...state, 
        metrics: { 
          mutations: state.metrics.mutations + m, 
          steps: state.metrics.steps + stepIncr, 
          errors: state.metrics.errors + e, 
          progress 
        } 
      };
    }

    case ACTION_TYPES.RESET_SESSION:
      return { 
        ...state, 
        isIndexed: false, 
        isComplete: false, 
        metrics: initialMetrics, 
        status: 'IDLE', 
        activePath: 'Ready' 
      };

    case ACTION_TYPES.MARK_COMPLETE:
      return { 
        ...state, 
        isComplete: true, 
        isIndexed: false, 
        isLive: false, 
        status: 'FINISHED', 
        activePath: 'Queue Complete' 
      };
      
    default:
      return state;
  }
}

// --- Custom Hooks and Core Logic ---

/**
 * Hook for managing Firebase initialization and authentication.
 */
function useFirebaseAuth(dispatch, setUser) {
  const [firebaseReady, setFirebaseReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const { FIREBASE_CONFIG, INITIAL_AUTH_TOKEN } = CONFIG;

    if (!FIREBASE_CONFIG) {
        if (isMounted) setFirebaseReady(true);
        return;
    }

    const initFirebase = async () => {
      try {
        const app = initializeApp(FIREBASE_CONFIG);
        const auth = getAuth(app);

        const userCredential = INITIAL_AUTH_TOKEN 
          ? await signInWithCustomToken(auth, INITIAL_AUTH_TOKEN)
          : await signInAnonymously(auth);
        
        onAuthStateChanged(auth, (u) => { 
          if (isMounted) { 
            setUser(u); 
            setFirebaseReady(true); 
          }
        });
      } catch (e) {
        if (isMounted) {
            console.error("Firebase Initialization Failed:", e);
            setFirebaseReady(true);
        }
      }
    };
    initFirebase();
    return () => { isMounted = false; };
  }, [dispatch, setUser]);

  return firebaseReady;
}


export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [user, setUser] = useState(null);
  
  // Refs for holding dynamic state/credentials that don't trigger re-renders
  const ghTokenRef = useRef('');
  const geminiKeyRef = useRef('');
  const projectContextRef = useRef(''); 
  const customInstructionsRef = useRef(''); 
  const readmeDataRef = useRef({ path: '', sha: '', content: '' });
  const todoFileRef = useRef({ path: '', sha: '', content: '' });
  
  // Refs for cycle control flow
  const isProcessingRef = useRef(false);
  const queueRef = useRef([]);
  const currentIndexRef = useRef(0);
  const abortControllerRef = useRef(null);

  const firebaseReady = useFirebaseAuth(dispatch, setUser);

  const addLog = useCallback((msg, type = 'info') => {
    dispatch({ 
      type: ACTION_TYPES.ADD_LOG, 
      payload: { msg, type, timestamp: new Date().toLocaleTimeString([], { hour12: false }) } 
    });
  }, []);

  // --- API Handlers ---

  const callGeminiAPI = useCallback(async (payload, modelId, apiKey, retryCount = 0) => {
    const url = `${CONFIG.GEMINI_API_BASE}/models/${modelId}:generateContent?key=${apiKey}`;
    
    abortControllerRef.current = new AbortController();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(`API Error: ${res.status} ${errorBody?.error?.message || ''}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) throw new Error("Empty or Malformed Response");
      
      // Aggressively clean common markdown wrappers
      return text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();

    } catch (e) {
      if (e.name === 'AbortError') throw e;
      
      if (retryCount < CONFIG.MAX_API_RETRIES && state.isLive) {
        const delay = Math.pow(2, retryCount) * 1000;
        addLog(`API call failed for ${modelId}. Retrying in ${delay/1000}s...`, 'warning');
        await new Promise(r => setTimeout(r, delay));
        return callGeminiAPI(payload, modelId, apiKey, retryCount + 1);
      }
      throw e;
    }
  }, [state.isLive, addLog]);


  const generateContent = useCallback((prompt, personaText, modelId, apiKey, context, instructions) => {
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
      generationConfig: { 
        temperature: 0.1, 
        responseMimeType: "text/plain" 
      }
    };
    return callGeminiAPI(payload, modelId, apiKey);
  }, [callGeminiAPI]);


  const updateTodoAndPlan = useCallback(async (owner, repo, token, apiKey, modelId, fileProcessed, codeSummary) => {
    const todoFile = todoFileRef.current;
    if (!todoFile.path || !todoFile.sha) return;
    
    const prompt = `
      Act as a Project Manager. Update the Markdown TODO list based on the recent change.
      File just changed: "${fileProcessed}"
      Change Summary: ${codeSummary}
      
      Current List:
      ${todoFile.content || "Empty"}
      
      Output the updated Markdown list ONLY.
    `;

    try {
      const updatedMarkdown = await generateContent(prompt, "Project Management Mode", modelId, apiKey, "", "");
      
      // Sanity check for meaningful output
      if (updatedMarkdown && updatedMarkdown.trim().length > 50) { 
        const url = `${CONFIG.GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${todoFile.path}`;
        
        const putRes = await fetch(url, {
          method: 'PUT',
          headers: { 
            'Authorization': `token ${token}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({
            message: `[Sovereign] Roadmap Update: ${fileProcessed}`,
            content: base64Encode(updatedMarkdown),
            sha: todoFile.sha
          })
        });

        if (putRes.ok) {
          const resData = await putRes.json();
          todoFileRef.current.content = updatedMarkdown;
          todoFileRef.current.sha = resData.content.sha;
          addLog("Roadmap Updated Successfully", "success");
        } else {
            const errBody = await putRes.json().catch(() => ({}));
            addLog(`Failed to commit Roadmap update (HTTP ${putRes.status}): ${errBody.message || 'Unknown error'}`, "warning");
        }
      }
    } catch (e) { 
      addLog(`Roadmap synchronization failed: ${e.message}`, "warning"); 
    }
  }, [generateContent, addLog]);

  /**
   * Fetches, processes, and commits a single file through the AI pipeline.
   */
  const processFile = useCallback(async (filePath, owner, repo, token, apiKey, modelId) => {
    const fileName = filePath.toLowerCase().split('/').pop();
    const isTodo = TODO_FILE_NAMES.includes(fileName);
    const pathEncoded = filePath.split('/').map(encodeURIComponent).join('/');
    const url = `${CONFIG.GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${pathEncoded}`;
    const headers = { 
        'Authorization': `token ${token}`, 
        'Accept': 'application/vnd.github.v3+json' 
    };

    // 1. Fetch File Content
    const res = await fetch(url, { headers });
    if (!res.ok) {
        throw new Error(`GitHub Fetch Failure (${res.status})`);
    }
    const data = await res.json();
    let content = base64Decode(data.content);
    const sha = data.sha;
    
    // 2. Handle Special Files (Context/Instructions)
    if (isTodo) {
      customInstructionsRef.current = content;
      todoFileRef.current = { path: filePath, sha, content };
      addLog(`Mastered Tasks: ${fileName}`, "success");
      return { status: 'CONTEXT_LOADED' };
    }
    
    if (fileName === 'readme.md') {
      projectContextRef.current = content.slice(0, 3000); 
      readmeDataRef.current = { path: filePath, sha, content };
      addLog(`Loaded Project Context: ${fileName}`, "success");
      return { status: 'CONTEXT_LOADED' };
    }

    // 3. Apply AI Pipeline (Only process files that pass initial configuration/size checks)
    const pipeline = getPipeline(filePath);
    let currentContent = content;
    let mutated = false;
    
    for (const step of pipeline) {
      if (!state.isLive) break;

      dispatch({ type: ACTION_TYPES.SET_STATUS, value: 'EVOLVING', path: filePath });
      
      const processed = await generateContent(
        currentContent, 
        step.text, 
        modelId, 
        apiKey, 
        projectContextRef.current, 
        customInstructionsRef.current
      );
      
      // Guard: Block outputs that look like LLM chatter or incomplete markdown blocks
      const isCode = FILE_EXTENSIONS.CODE.test(filePath);
      if (isCode && (processed.includes('##') || processed.includes('Act as a'))) {
        addLog(`Blocked Invalid Output for ${fileName} (Format Spillover Detected)`, "error");
        dispatch({ type: ACTION_TYPES.UPDATE_METRICS, e: 1 });
        continue; 
      }

      // Check for effective change and size limit
      if (processed && processed !== currentContent && processed.length < CONFIG.MAX_FILE_SIZE_BYTES) {
        currentContent = processed;
        mutated = true;
      }
      
      dispatch({ type: ACTION_TYPES.UPDATE_METRICS, stepIncr: 1 });
    }

    // 4. Commit Changes to GitHub
    if (mutated && state.isLive) {
      const putRes = await fetch(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: `[Sovereign] Logic Evolution: ${filePath}`, 
          content: base64Encode(currentContent), 
          sha 
        })
      });
      
      if (putRes.ok) {
        // 5. Update Roadmap asynchronously after successful commit
        await updateTodoAndPlan(owner, repo, token, apiKey, modelId, filePath, "Applied architectural refactoring.");
        return { status: 'MUTATED' };
      } else {
        const errorData = await putRes.json().catch(() => ({ message: 'Unknown commit failure' }));
        throw new Error(`GitHub Commit Failure (${putRes.status}): ${errorData.message}`);
      }
    }
    
    return { status: 'SKIPPED' };
  }, [state.isLive, addLog, generateContent, updateTodoAndPlan]);


  /**
   * Executes the processing logic for a single file in the queue cycle.
   */
  const runCycle = useCallback(async () => {
    if (!state.isLive || isProcessingRef.current || !state.isIndexed) return;
    
    const target = queueRef.current[currentIndexRef.current];
    const repoPath = parseRepoPath(state.targetRepo);
    
    if (!repoPath) {
        addLog("Invalid repository path configured. Stopping.", "error");
        dispatch({ type: ACTION_TYPES.TOGGLE_LIVE });
        return;
    }

    if (!target) {
      dispatch({ type: ACTION_TYPES.MARK_COMPLETE });
      return;
    }
    
    isProcessingRef.current = true;
    const [owner, repo] = repoPath;

    try {
      const result = await processFile(
        target, 
        owner, 
        repo, 
        ghTokenRef.current, 
        geminiKeyRef.current, 
        state.selectedModel
      );
      
      if (result.status === 'MUTATED') {
        addLog(`MUTATED: ${target.split('/').pop()}`, "success");
        dispatch({ type: ACTION_TYPES.UPDATE_METRICS, m: 1 });
      } else if (result.status === 'SKIPPED') {
        addLog(`SCAN: ${target.split('/').pop()}`, "info");
      }
      
    } catch (e) {
      if (e.name !== 'AbortError') {
        addLog(`FAULT [${target.split('/').pop()}]: ${e.message}`, "error");
        dispatch({ type: ACTION_TYPES.UPDATE_METRICS, e: 1 });
      } else {
        addLog("Cycle Aborted by User", "warning");
      }
    } finally {
      currentIndexRef.current++;
      dispatch({ 
        type: ACTION_TYPES.UPDATE_METRICS, 
        cursor: currentIndexRef.current, 
        total: queueRef.current.length 
      });
      isProcessingRef.current = false;
      dispatch({ type: ACTION_TYPES.SET_STATUS, value: 'IDLE', path: 'Neural Standby' });
    }
  }, [state.isLive, state.targetRepo, state.selectedModel, state.isIndexed, addLog, processFile]);


  // --- Effects ---

  // Polling/Cycle Effect
  useEffect(() => {
    if (!state.isLive || !state.isIndexed) return;
    
    const timer = setInterval(runCycle, CONFIG.CYCLE_INTERVAL_MS);
    runCycle(); // Run immediately on activation
    
    return () => clearInterval(timer);
  }, [state.isLive, state.isIndexed, runCycle]);


  /**
   * Fetches the repo tree, filters files, and initializes the queue.
   */
  const discover = async () => {
    const repoPath = parseRepoPath(state.targetRepo);
    if (!repoPath || !ghTokenRef.current || !geminiKeyRef.current) {
        addLog("Configuration missing (Repo Path, GitHub Token, or Gemini Key).", "error");
        return;
    }
    
    dispatch({ type: ACTION_TYPES.RESET_SESSION });
    dispatch({ type: ACTION_TYPES.SET_STATUS, value: 'INDEXING' });

    try {
      const [owner, repo] = repoPath;
      const headers = { 
          'Authorization': `token ${ghTokenRef.current}`, 
          'Accept': 'application/vnd.github.v3+json' 
      };

      // 1. Get Default Branch (using simplified path to avoid extra object mapping if possible)
      const rRes = await fetch(`${CONFIG.GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers });
      if (!rRes.ok) throw new Error(`Repo access failed (${rRes.status})`);
      const rData = await rRes.json();
      const defaultBranch = rData.default_branch || 'main';

      // 2. Get Recursive Tree
      const tRes = await fetch(`${CONFIG.GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, { headers });
      if (!tRes.ok) throw new Error(`Tree fetch failed (${tRes.status})`);
      const tData = await tRes.json();
      
      // 3. Filter and Sort Files
      let files = (tData?.tree || [])
        .filter(f => 
            f.type === 'blob' && 
            f.size < CONFIG.MAX_FILE_SIZE_BYTES && 
            !SKIP_PATTERNS.some(p => p.test(f.path)) && 
            (FILE_EXTENSIONS.CODE.test(f.path) || FILE_EXTENSIONS.CONFIG.test(f.path) || FILE_EXTENSIONS.DOCS.test(f.path))
        ).map(f => f.path);
      
      // Prioritize instruction files and context files
      files.sort((a, b) => {
        const aL = a.toLowerCase().split('/').pop();
        const bL = b.toLowerCase().split('/').pop();
        
        const aIsTodo = TODO_FILE_NAMES.includes(aL);
        const bIsTodo = TODO_FILE_NAMES.includes(bL);

        if (aIsTodo && !bIsTodo) return -1;
        if (bIsTodo && !aIsTodo) return 1;
        
        if (aL === 'readme.md' && bL !== 'readme.md') return -1;
        if (bL === 'readme.md' && aL !== 'readme.md') return 1;
        return 0;
      });

      queueRef.current = files;
      currentIndexRef.current = 0;
      dispatch({ type: ACTION_TYPES.SET_VALUE, key: 'isIndexed', value: true });
      addLog(`Indexed ${files.length} Target Files for processing.`, "success");
      
    } catch (e) { 
        addLog(`Indexing Failed: ${e.message}`, "error"); 
    } finally { 
        // Only update status to IDLE if not complete or stopping
        if (!state.isLive) {
            dispatch({ type: ACTION_TYPES.SET_STATUS, value: 'IDLE' }); 
        }
    }
  };


  // --- Render Logic ---

  if (!state.isAcknowledged) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8 text-white font-mono">
        <div className="max-w-md w-full p-12 rounded-[3rem] bg-zinc-950 border border-emerald-500/20 text-center">
          <div className="text-6xl mb-6">🛰️</div>
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-2 italic">Sovereign <span className="text-emerald-500">Lite</span></h1>
          <p className="text-[10px] text-zinc-600 uppercase tracking-[0.5em] mb-12 font-bold italic">Boundary Control v86.40</p>
          <button onClick={() => dispatch({ type: ACTION_TYPES.ACKNOWLEDGE })} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase text-[11px] tracking-widest transition-all hover:bg-zinc-200">Engage</button>
        </div>
      </div>
    );
  }

  if (!firebaseReady) return <div className="min-h-screen bg-black flex items-center justify-center font-mono text-zinc-800 tracking-widest text-[10px]">ESTABLISHING_SECURE_LINK...</div>;

  const toggleLiveHandler = () => {
    if (state.isLive) {
      dispatch({ type: ACTION_TYPES.TOGGLE_LIVE });
      abortControllerRef.current?.abort(); 
    } else if (state.isIndexed) {
      dispatch({ type: ACTION_TYPES.TOGGLE_LIVE });
    } else {
      discover();
    }
  };

  const statusColor = state.isLive ? 'bg-emerald-600 text-white' : state.isComplete ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500';
  const buttonDisabled = !state.targetRepo || !ghTokenRef.current || !geminiKeyRef.current;

  return (
    <div className="min-h-screen bg-[#020202] text-zinc-300 p-4 md:p-10 font-mono text-[13px]">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="p-10 rounded-[3rem] bg-zinc-900/50 border border-white/5 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-8">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-3xl border transition-all ${state.isLive ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 animate-pulse' : 'bg-zinc-800/20 text-zinc-600 border-zinc-700/50'}`}>{state.isLive ? '🦾' : state.isComplete ? '✅' : '🔘'}</div>
            <div>
              <h1 className="text-2xl font-black text-white uppercase italic">Sovereign <span className="text-emerald-500 text-sm">v86.40</span></h1>
              <div className="flex items-center gap-4 mt-1">
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${statusColor}`}>{state.status}</span>
                <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">{state.activePath}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <button 
                onClick={toggleLiveHandler} 
                disabled={buttonDisabled && !state.isLive}
                className={`px-14 py-5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all 
                ${state.isLive ? 'bg-red-600 text-white hover:bg-red-500' 
                : state.isIndexed ? 'bg-emerald-600 text-white hover:bg-emerald-500' 
                : 'bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600'}`}
            >
                {state.isLive ? 'Halt' : state.isIndexed ? 'Activate' : 'Discover & Sync'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-4 space-y-8">
             <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] space-y-6">
              <h3 className="text-[11px] font-bold uppercase text-emerald-400 border-b border-white/10 pb-2">Credentials & Targets</h3>
              
              <div className="space-y-2">
                <label htmlFor="repo-path" className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Vault (owner/repo)</label>
                <input id="repo-path" type="text" value={state.targetRepo} onChange={e => dispatch({ type: ACTION_TYPES.SET_VALUE, key: 'targetRepo', value: e.target.value })} disabled={state.isLive || state.isIndexed} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white outline-none font-bold text-sm" placeholder="e.g., user/repo-name" />
              </div>
              <div className="space-y-2">
                <label htmlFor="gh-token" className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Auth Secret (GitHub Token)</label>
                <input id="gh-token" type="password" onChange={e => ghTokenRef.current = e.target.value} disabled={state.isLive || state.isIndexed} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white outline-none text-sm" placeholder="Hidden" />
              </div>
              <div className="space-y-2">
                <label htmlFor="gemini-key" className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Gemini Key</label>
                <input id="gemini-key" type="password" onChange={e => geminiKeyRef.current = e.target.value} disabled={state.isLive || state.isIndexed} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white outline-none text-sm" placeholder="Hidden" />
              </div>
              <div className="space-y-2">
                <label htmlFor="model-select" className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Model Tier</label>
                <select id="model-select" value={state.selectedModel} onChange={e => dispatch({ type: ACTION_TYPES.SET_VALUE, key: 'selectedModel', value: e.target.value })} disabled={state.isLive || state.isIndexed} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white outline-none font-bold appearance-none text-sm">
                  {MODELS.map(model => (
                    <option key={model.id} value={model.id}>{model.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </aside>
          
          <main className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-3 gap-6 text-center">
              <div className="p-6 bg-zinc-900/30 border border-white/5 rounded-[2.5rem]"><div className="text-4xl font-black text-emerald-500">{state.metrics.mutations}</div><div className="text-[10px] font-black uppercase text-zinc-600 mt-1">Mutations</div></div>
              <div className="p-6 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] relative overflow-hidden">
                <div className="text-4xl font-black text-white">{state.metrics.progress}%</div>
                <div className="text-[10px] font-black uppercase text-zinc-600 mt-1">Progress ({currentIndexRef.current}/{queueRef.current.length})</div>
                <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-300" style={{ width: `${state.metrics.progress}%` }} />
              </div>
              <div className="p-6 bg-zinc-900/30 border border-white/5 rounded-[2.5rem]"><div className="text-4xl font-black text-red-500">{state.metrics.errors}</div><div className="text-[10px] font-black uppercase text-zinc-600 mt-1">Spillovers</div></div>
            </div>
            
            <div className="h-[450px] bg-black border border-white/5 rounded-[3rem] flex flex-col overflow-hidden">
              <div className="p-4 border-b border-white/5 bg-zinc-900/10 text-[10px] font-black uppercase tracking-widest text-zinc-500">Neural Log</div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 text-[12px] log-area">
                {state.logs.map((l, index) => (
                    <div key={l.id} className="flex gap-4 transition-opacity duration-500 opacity-100">
                        <span className="text-zinc-800 font-bold shrink-0">{l.timestamp}</span>
                        <span className={l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-emerald-400' : 'text-zinc-500'}>{l.msg}</span>
                    </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
      {/* Inline style for scrollbar customization is cleaner than external CSS for self-contained components */}
      <style jsx global>{`
        .log-area::-webkit-scrollbar {
            width: 6px;
        }
        .log-area::-webkit-scrollbar-track {
            background: #1e1e1e;
        }
        .log-area::-webkit-scrollbar-thumb {
            background: #3f3f46;
            border-radius: 3px;
        }
        .log-area::-webkit-scrollbar-thumb:hover {
            background: #52525b;
        }
      `}</style>
    </div>
  );
}