# Sovereign v86: Autonomous Code Refactoring Agent

An autonomous code refactoring agent with adaptive custom instruction support and intelligent project management capabilities. The agent reads project context from README.md, applies refactoring rules from custom TODO/instruction files, and maintains its own roadmap through AI-driven updates.

---

## Features

- 🤖 **AI-Powered Refactoring** - Uses Gemini models to analyze and improve code quality
- 📝 **Custom Instructions** - Supports user-defined refactoring rules via TODO files
- 🔄 **Auto-Updating Roadmap** - Maintains project TODO list based on actual changes made
- 🛡️ **Markdown Protection** - Guards against AI spillover in code files
- 📊 **Smart Queue Prioritization** - Processes files in logical order (TODO → Code → README)
- 🔒 **Multi-Model Support** - Lite, Flash 2.5, and Flash 3.0 models
- 📈 **Project Context Awareness** - Uses README content for informed refactoring decisions
- ⚡ **Rate Limit Handling** - Automatic model switching when rate limited
- 🔥 **Model Health Tracking** - Monitors and adapts to API availability

---

## Quick Start

### Prerequisites

To operate Sovereign v86, you need:

1. **GitHub Repository** - The URL of your target repository (e.g., `owner/repo`)
2. **GitHub Token** - A valid Personal Access Token (PAT) with `repo` and `contents` read/write permissions
3. **Gemini API Key** - A valid API key for Google Gemini models

### Configuration

The agent automatically initializes with these configurations:

| Setting | Default | Description |
|----------|---------|-------------|
| **Cycle Interval** | 15 seconds | Time between file processing cycles |
| **Max File Size** | 1MB | Files larger than this are skipped |
| **Max Retries** | 5 | Number of API retry attempts |
| **Log History** | 60 entries | Console output history limit |

---

## Custom Instructions System

### Supported Instruction Files

Sovereign v86 reads custom instructions from these files (in priority order):

| Filename | Purpose | Processing |
|----------|---------|-------------|
| `.sovereign-instructions.md` | Global refactoring rules | Applied to all files |
| `sovereign-todo.md` | Project-specific tasks | Applied as override instructions |
| `instructions.md` | General instructions | Fallback instruction source |

### Instruction File Format

Create a `.sovereign-instructions.md` file in your repository root:

```markdown
# Sovereign Custom Instructions

## Global Rules
- Add JSDoc documentation to all public functions
- Use modern ES6+ syntax (const/let, arrow functions)
- Remove console.log statements
- Add input validation to user-facing functions

## JavaScript Files
- Convert callbacks to async/await
- Add proper error boundaries
- Remove unused imports and variables

## Python Files
- Add type hints to all functions
- Use f-strings for string formatting
- Add docstrings following PEP 257
- Use context managers for resource cleanup

## HTML/CSS Files
- Use semantic HTML5 elements
- Remove inline styles (move to CSS)
- Use modern CSS features (Grid, Flexbox)
- Add ARIA labels for accessibility

## Markdown Files
- Fix grammar and spelling errors
- Improve heading hierarchy
- Add code examples where helpful
- Ensure consistent formatting
```

---

## File Processing Order

Sovereign v86 processes files in this priority order:

1. 🥇 **TODO/Instruction files** - Read and applied, not modified
2. 🥈 **Code and Config files** - Main refactoring target
3. 🥉 **README.md** - Used as project context only (read-only)

**Note:** README.md is never modified by the agent and is always processed last to gather maximum project context.

---

## Auto-Updating Roadmap Feature

The agent automatically updates your TODO file after each successful mutation:

### How It Works

1. Agent successfully refactors a code file
2. AI is asked to update the project TODO list based on changes made
3. Updated TODO markdown is committed back to the repository
4. Changes are tracked in the commit message: `[Sovereign] Roadmap Update: {filename}`

### Example TODO Update

If the agent adds error handling to a file, the TODO might be updated to:

```markdown
- [x] Add comprehensive error handling
- [ ] Add unit tests
- [ ] Document API endpoints
```

---

## Safety Features

### Markdown Spillover Protection

The agent includes robust protection against AI models outputting markdown explanations in code files:

- ✅ Detects markdown headers (`##`) in code file outputs
- ✅ Detects role-playing text (`Act as a`) in code file outputs
- ✅ Rejects contaminated output and retries with stricter prompt
- ✅ Logs "Spillover Detected" error for user awareness

### Exclusion List

Files matching these patterns are automatically skipped:

- `node_modules/` - Dependency directories
- `*.min.js` - Minified files
- `*-lock.*` - Lock files
- `dist/`, `build/` - Build directories
- `.git/` - Git metadata
- `*.log` - Log files
- `.txt` files - Protected files (use `.txt` extension to protect files from modification)

**To exclude a file**, rename it with `.txt` extension:
```
config.json → config.json.txt
.env → .env.txt
```

---

## Model Selection

Available AI models:

| Model | Tier | Best For |
|-------|-------|----------|
| **Flash 2.5 Preview** | Lite | Cost-effective refactoring |
| **Flash 1.5 Stable** | Stable | Reliable, production-safe refactoring |
| **Flash 3.0** | Experimental | Advanced features (when available) |

**Recommendation:** Start with `Flash 1.5 Stable` for reliable refactoring. Use `Lite` for large repositories to minimize costs.

---

## Operational Status

The agent dashboard shows these real-time statuses:

| Status | Meaning |
|---------|----------|
| **IDLE** | Agent ready, awaiting initialization |
| **INDEXING** | Scanning repository for files |
| **ANALYZING** | Processing file with AI |
| **EVOLVING** | Refactoring code |
| **NEURAL STANDBY** | Waiting for next cycle |
| **FINISHED** | All files processed |

---

## Metrics

Tracked throughout the refactoring session:

- 📊 **Mutations** - Number of files successfully refactored
- 📋 **Steps** - Total processing steps executed
- ❌ **Errors** - Number of errors encountered
- ⏱️ **Latency** - Average processing time per file
- 📈 **Progress** - Percentage of queue completed

---

## ⚠️ Critical Warning: Destructive Commit Strategy

**Sovereign v86 commits changes directly to the target branch (e.g., `main`), overwriting the original code structure without confirmation.**

### Required Actions

✅ **Use with extreme caution**
✅ **Run against a dedicated feature branch or a repository fork**
✅ **Review changes before pushing to main**
✅ **Keep regular backups of your repository**

### Best Practices

1. **Test on fork:** Create a fork, run agent there, then review changes via Pull Request
2. **Branch isolation:** Create a new branch before running the agent
3. **Code review:** Always review the diff before merging to main
4. **Incremental updates:** Process smaller batches of files for better control

---

## Troubleshooting

### Agent stops processing

**Possible causes:**
- GitHub API rate limit exceeded (wait 60 seconds)
- Model blocked (auto-switches to available model)
- Invalid credentials (check token and API key)
- Repository not accessible (verify permissions)

**Solution:** Check the console logs for specific error messages.

### "Spillover Detected" errors

The AI model may sometimes output markdown explanations instead of pure code. The agent:

1. Detects this condition
2. Logs an error
3. Retries with a stricter prompt
4. If retries fail, the file is skipped

**To reduce spillover:** Add clearer instructions in your custom instructions file.

### Files are being skipped

If files you expected to be refactored are being skipped:

- Check if file matches exclusion patterns
- Verify file is under 1MB size limit
- Check if file has `.txt` extension (protected files)
- Review `sovereign-todo.md` for any skip rules

---

## License

MIT License - See [LICENSE](LICENSE) for details.

Copyright © 2026 CRAIG HUCKERBY

---

## Development & Support

For issues, questions, or contributions, visit the repository or open an issue.
