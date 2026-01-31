// NEXUS_EVO: RNZP89
// NEXUS_EVO: P4KCEQ
// NEXUS_EVO: 86ZUV
// NEXUS_EVO: 523W9F
// NEXUS_EVO: CML7ML
// NEXUS_EVO: 0JPXV8
} catch (e) {
      clearTimeout(timeoutId);
      if (retryCount < CONFIG.MAX_API_RETRIES && state.isLive) {
        await new Promise(r => setTimeout(r, Math.pow(2, retryCount) * 1000));
        return callGeminiAPI(prompt, personaText, modelId, apiKey, retryCount + 1);
      }
      throw e;
    }
  }, [state.isLive]);

  const processFile = async (filePath, owner, repo, token, apiKey, modelId) => {
    const path = filePath.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Fetch Error ${res.status}`);
    const data = await res.json();
    let content = decodeBase64(data.content);
    
    dispatch({ type: 'SET_STATUS', value: 'PROCESSING', path: filePath });
    const processed = await callGeminiAPI(content, PIPELINES.GENERIC[0].text, modelId, apiKey);
    
    if (processed && processed !== content && processed.length > 5) {
      await fetch(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Sovereign: ${filePath}`, content: encodeBase64(processed), sha: data.sha })
      });
      return { status: 'MUTATED', filePath };
    }
    return { status: 'SKIPPED', filePath };
  };

  const runCycle = useCallback(async () => {
    if (!state.isLive || isProcessingRef.current || !state.isIndexed || !user) return;
    isProcessingRef.current = true;

    const target = queueRef.current[currentIndexRef.current];
    if (!target) {
      addLog("Job Finished.", "success");
      dispatch({ type: 'MARK_COMPLETE' });
      isProcessingRef.current = false;
      return;
    }

    try {
      const [owner, repo] = parseRepoPath(state.targetRepo);
      const result = await processFile(target, owner, repo, ghTokenRef.current, geminiKeyRef.current, state.selectedModel);
      
      if (result.status === 'MUTATED') {
        const docRef = doc(db, 'artifacts', CONFIG.APP_ID, 'users', user.uid, 'history', safeDocId(target));
        await setDoc(docRef, { path: target, ts: serverTimestamp() }).catch(() => {});
        addLog(`MUTATED: ${target.split('/').pop()}`, "success");
        dispatch({ type: 'UPDATE_METRICS', m: 1 });
      } else {
        addLog(`CLEAN: ${target.split('/').pop()}`, "info");
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        addLog(`FAULT: ${e.message}`, "error");
        dispatch({ type: 'UPDATE_METRICS', e: 1 });
      }
    } finally {
      currentIndexRef.current++;
      dispatch({ type: 'UPDATE_METRICS', cursor: currentIndexRef.current, total: queueRef.current.length });
      isProcessingRef.current = false;
      dispatch({ type: 'SET_STATUS', value: 'IDLE' });
    }
  }, [state.isLive, state.targetRepo, state.selectedModel, state.isIndexed, user, addLog]);

  useEffect(() => {
    if (!state.isLive) return;
    const timer = setInterval(runCycle, CONFIG.CYCLE_INTERVAL_MS);
    runCycle();
    return () => clearInterval(timer);
  }, [state.isLive, runCycle]);

  const handleMainButton = async () => {
    if (state.isLive) {
      dispatch({ type: 'TOGGLE_LIVE' });
      abortControllerRef.current?.abort();
      return;
    }
    if (state.isIndexed) return dispatch({ type: 'TOGGLE_LIVE' });

    const repoPath = parseRepoPath(state.targetRepo);
    if (!repoPath || !ghTokenRef.current || !geminiKeyRef.current) return addLog("Configuration Incomplete", "error");

    dispatch({ type: 'SET_STATUS', value: 'INDEXING' });
    try {
      const [owner, repo] = repoPath;
      const headers = { 'Authorization': `token ${ghTokenRef.current}` };
      const repoData = await (await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })).json();
      const tree = await (await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${repoData.default_branch}?recursive=1`, { headers })).json();

      queueRef.current = (tree.tree || [])
        .filter(f => f.type === 'blob' && f.size < CONFIG.MAX_FILE_SIZE_BYTES && !SKIP_PATTERNS.some(p => p.test(f.path)) && FILE_EXTENSIONS.ALL.test(f.path))
        .map(f => f.path);

      currentIndexRef.current = 0;
      dispatch({ type: 'SET_VAL', key: 'isIndexed', value: true });
      addLog(`Indexed ${queueRef.current.length} items.`, "success");
    } catch (e) {
      addLog(`Index Error: ${e.message}`, "error");
    } finally {
      dispatch({ type: 'SET_STATUS', value: 'IDLE' });
    }
  };

  if (!state.isAcknowledged) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8 text-white font-mono">
        <div className="max-w-md w-full p-12 rounded-[3rem] bg-zinc-950 border border-white/5 text-center">
          <div className="text-5xl mb-8">🗂️</div>
          <h1 className="text-2xl font-black uppercase tracking-tighter mb-2 italic">Sovereign <span className="text-emerald-500">Template</span></h1>
          <p className="text-[10px] text-zinc-600 uppercase tracking-[0.5em] mb-12 font-bold italic">Blank Logic V1.0</p>
          <button onClick={() => dispatch({ type: 'ACKNOWLEDGE' })} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase text-[11px] tracking-widest hover:scale-[1.02] transition-all">Launch Core</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030303] text-zinc-300 p-4 md:p-10 font-mono">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="p-8 md:p-10 rounded-[3rem] bg-zinc-900/50 border border-white/5 flex flex-col lg:flex-row items-center justify-between gap-8 backdrop-blur-md">
          <div className="flex items-center gap-8">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-3xl border transition-all ${state.isLive ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 animate-pulse' : 'bg-zinc-800/20 text-zinc-700 border-zinc-800'}`}>
              {state.isLive ? '⚡' : '💿'}
            </div>
            <div>
              <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">Sovereign</h1>
              <div className="flex items-center gap-4 mt-1">
                <span className={`px-3 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${state.isLive ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>{state.status}</span>
                <span className="text-[10px] text-zinc-500 font-bold truncate max-w-[200px]">{state.activePath}</span>
              </div>
            </div>
          </div>
          <button onClick={handleMainButton} className={`px-14 py-5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${state.isLive ? 'bg-red-600 text-white' : state.isIndexed ? 'bg-emerald-600 text-white' : 'bg-white text-black hover:bg-zinc-200'}`}>
            {state.isLive ? 'Stop' : state.isIndexed ? 'Start' : 'Index'}
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-4 space-y-8">
            <div className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] space-y-8">
              <div className="space-y-3">
                <label className="text-[11px] font-black text-zinc-600 uppercase tracking-widest">Repository (owner/repo)</label>
                <input type="text" value={state.targetRepo} onChange={e => dispatch({ type: 'SET_VAL', key: 'targetRepo', value: e.target.value })} disabled={state.isLive || state.isIndexed} className="w-full bg-black/50 border border-white/5 rounded-xl p-5 text-sm text-white focus:border-white/20 outline-none" placeholder="e.g. facebook/react" />
              </div>
              <div className="space-y-3">
                <label className="text-[11px] font-black text-zinc-600 uppercase tracking-widest">GitHub Secret</label>
                <input type="password" onChange={e => ghTokenRef.current = e.target.value} disabled={state.isLive || state.isIndexed} className="w-full bg-black/50 border border-white/5 rounded-xl p-5 text-sm text-white focus:border-white/20 outline-none" placeholder="ghp_..." />
              </div>
              <div className="space-y-3">
                <label className="text-[11px] font-black text-zinc-600 uppercase tracking-widest">Gemini API Key</label>
                <input type="password" onChange={e => geminiKeyRef.current = e.target.value} disabled={state.isLive || state.isIndexed} className="w-full bg-black/50 border border-white/5 rounded-xl p-5 text-sm text-white focus:border-white/20 outline-none" placeholder="AIza..." />
              </div>
            </div>
          </aside>

          <main className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-3 gap-6">
              {[ { l: 'Mutations', v: state.metrics.mutations, c: 'text-emerald-500' }, { l: 'Progress', v: `${state.metrics.progress}%`, c: 'text-white' }, { l: 'Faults', v: state.metrics.errors, c: 'text-red-500' } ].map((m, i) => (
                <div key={i} className="p-8 bg-zinc-900/30 border border-white/5 rounded-[2.5rem] text-center">
                  <div className={`text-3xl font-black mb-1 tabular-nums ${m.c}`}>{m.v}</div>
                  <div className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">{m.l}</div>
                </div>
              ))}
            </div>

            <div className="h-[500px] bg-black border border-white/5 rounded-[3.5rem] flex flex-col overflow-hidden shadow-2xl">
              <div className="px-10 py-6 border-b border-white/5 bg-zinc-900/10 text-[12px] font-black text-zinc-500 uppercase tracking-widest">Telemetry Log</div>
              <div className="flex-1 overflow-y-auto p-10 space-y-3 log-area">
                {state.logs.map((l, i) => (
                  <div key={i} className={`text-[12px] flex gap-4 ${l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    <span className="opacity-30 shrink-0">{l.timestamp}</span>
                    <span className="font-medium">{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
      <style>{`.log-area::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}
