# Sovereign v86: Autonomous Code Refactoring Agent

An autonomous code refactoring agent featuring adaptive custom instruction support and intelligent project management capabilities. The agent analyzes project context from `README.md`, applies refactoring rules defined in custom instruction files, and maintains an AI-driven operational roadmap.

## Core Capabilities

| Feature | Description |
| :--- | :--- |
| 🤖 **AI-Powered Refactoring** | Utilizes Gemini models for deep code analysis and quality improvement. |
| 📝 **Custom Instructions** | Supports user-defined refactoring directives via dedicated instruction files. |
| 🔄 **Auto-Updating Roadmap** | Dynamically maintains the project TODO list based on executed changes. |
| 🛡️ **Markdown Guardrails** | Implements strict validation to prevent markdown "spillover" into code artifacts. |
| 📊 **Smart Queue Prioritization** | Processes artifacts in a defined logical sequence: Instructions → Code → Context. |
| 🔒 **Multi-Model Support** | Integrates seamlessly with Lite, Flash 2.5, and Flash 3.0 model tiers. |
| 📈 **Project Context Awareness** | Informs refactoring decisions using content derived from `README.md`. |
| ⚡ **Rate Limit Resilience** | Features automatic model tier switching to handle API rate limiting gracefully. |
| 🔥 **Model Health Tracking** | Continuously monitors and adapts to external API availability status. |

---

## Operational Setup

### Prerequisites

1.  **GitHub Repository URL:** The path to the target repository (e.g., `owner/repo`).
2.  **GitHub Token (PAT):** A valid Personal Access Token granting `repo` and `contents` read/write permissions.
3.  **Gemini API Key:** A valid API key for accessing Google Gemini services.

### Agent Configuration Defaults

| Setting | Default Value | Description |
| :--- | :--- | :--- |
| **Cycle Interval** | 15 seconds | Delay between sequential file processing cycles. |
| **Max File Size** | 1MB | Maximum acceptable size for files slated for modification. |
| **Max API Retries** | 5 | Maximum number of attempts before abandoning an API call. |
| **Log History Limit** | 60 entries | Constraint on the number of console entries retained. |

---

## Instruction Management System

Sovereign v86 prioritizes and aggregates refactoring rules from specified instruction files found in the repository root.

### Instruction File Hierarchy (Priority Order)

1.  `.sovereign-instructions.md`: Global, high-priority refactoring rules.
2.  `sovereign-todo.md`: Project-specific tasks, overriding global rules where specified.
3.  `instructions.md`: General, lower-priority fallback instructions.

### Instruction File Structure Example (`.sovereign-instructions.md`)

```markdown
# Sovereign Custom Instructions

## Global Rules
- Enforce JSDoc documentation for all public interfaces.
- Standardize on modern ES6+ syntax (const/let, arrow functions).
- Eliminate stray `console.log` statements.
- Implement input validation for all user-facing entry points.

## File Type Specific Directives

### JavaScript Files
- Refactor callbacks to utilize `async/await` patterns.
- Ensure robust error boundaries (`try/catch`).
- Purge unused imports and declared variables.

### Python Files
- Apply static type hints to all function signatures.
- Utilize f-strings exclusively for string interpolation.
- Adhere to PEP 257 standards for docstrings.
- Manage temporary resources using context managers.

### Web Files (HTML/CSS)
- Mandate semantic HTML5 element usage.
- Prohibit inline CSS; enforce external or `<style>` block styles.
- Leverage modern CSS layout primitives (Grid, Flexbox).
- Incorporate ARIA attributes for enhanced accessibility.

### Markdown Files
- Perform comprehensive grammar and spelling correction.
- Optimize heading structure consistency.
- Inject illustrative code examples where context is lacking.
- Standardize overall document formatting.
```

---

## File Processing Sequence

The agent executes operations following this strict internal queue order:

1.  **🥇 Instruction Artifacts:** Read and process all instruction files. These files are **not** modified.
2.  **🥈 Core Code & Configuration:** Main targets for refactoring (e.g., `.js`, `.py`, `.ts`, `.json`).
3.  **🥉 Project Context:** `README.md` is read last to gather maximum contextual understanding *after* instructions and code assessment. This file is **read-only**.

---

## Roadmap Evolution (TODO Updates)

Upon successful mutation of a code artifact, the agent initiates an AI-driven update to the project roadmap (`sovereign-todo.md`).

### Update Mechanism

1.  Refactoring operation completes successfully for `<filename>`.
2.  The agent prompts the AI to synthesize the next set of required actions, reflecting the changes made.
3.  The updated TODO markdown content is committed back to the repository.
4.  Commit messages are standardized: `[Sovereign] Roadmap Update: <filename>`.

### Roadmap Mutation Example

If error handling was recently added to a file:

```markdown
- [x] Implement robust error handling mechanism (Refactored file X).
- [ ] Develop comprehensive unit test suites.
- [ ] Finalize documentation for exposed API endpoints.
```

---

## Safety and Exclusion Protocols

### Markdown Spillover Defense

Robust measures are in place to ensure model outputs contain only artifact code, free of extraneous commentary:

-   Detection of markdown headers (e.g., `##`) in code outputs.
-   Detection of role-playing phrases (e.g., "Act as a...").
-   Contaminated outputs trigger rejection, leading to a retry with a more stringent prompt.
-   "Spillover Detected" events are explicitly logged for user awareness.

### Exclusion Registry

Files matching the following patterns are bypassed automatically to maintain integrity and avoid performance degradation:

-   `node_modules/` (Dependency directories)
-   `*.min.js` (Minified assets)
-   `*-lock.*` (Dependency lock files)
-   `dist/`, `build/` (Output/Build directories)
-   `.git/` (Version control metadata)
-   `*.log` (Log files)
-   **Protection Extension:** Files appended with `.txt` are considered immutable for the current session (e.g., `.env` becomes `.env.txt`).

---

## Model Tier Selection

| Model Name | Tier | Recommended Use Case |
| :--- | :--- | :--- |
| **Flash 2.5 Preview** | Lite | Cost-sensitive operations on large codebases. |
| **Flash 1.5 Stable** | Stable | Reliable, default choice for predictable refactoring. |
| **Flash 3.0** | Experimental | Advanced reasoning, accessible when features stabilize. |

**Recommendation:** Begin with `Flash 1.5 Stable`. Utilize the `Lite` tier to manage operational expenses on extensive projects.

---

## Operational Status Dashboard

The agent displays its current operational state via the following indicators:

| Status | Description |
| :--- | :--- |
| **IDLE** | Agent initialized and awaiting command execution. |
| **INDEXING** | Scanning the file system and repository structure. |
| **ANALYZING** | Currently submitting a file or context to the AI model. |
| **EVOLVING** | Applying AI-generated code modifications. |
| **NEURAL STANDBY** | Paused, waiting for the next scheduled cycle interval. |
| **FINISHED** | All queued tasks have been completed. |

---

## Performance Metrics

The following metrics are tracked during an active session:

-   📊 **Mutations:** Count of files successfully refactored.
-   📋 **Steps:** Total atomic processing actions executed.
-   ❌ **Errors:** Cumulative count of encountered operational failures.
-   ⏱️ **Latency:** Mean processing time recorded per artifact.
-   📈 **Progress:** Completion percentage of the current task queue.

---

## ⚠️ Critical Warning: Destructive Commit Strategy

**Sovereign v86 executes commits directly onto the target branch (e.g., `main`), resulting in immediate and unconfirmed overwrites of original source code.**

### Mandatory Safety Procedures

✅ **Exercise Extreme Caution**
✅ **Target a Feature Branch or Repository Fork**
✅ **Mandatory Diff Review Prior to Pushing to Main**
✅ **Maintain Regular Repository Backups**

### Recommended Best Practices

1.  **Fork/Branch Isolation:** Always operate the agent within an isolated branch or a repository fork.
2.  **Incremental Execution:** Process files in smaller batches to maintain fine-grained control.
3.  **Thorough Review:** Critically inspect the resulting `git diff` before merging.

---

## Troubleshooting Guide

### Agent Halts Processing

**Potential Causes:**
-   GitHub API rate limit has been reached (Wait 60 seconds for renewal).
-   The active AI model is temporarily unavailable (Agent attempts automated tier fallback).
-   Invalid API Key or insufficient GitHub credentials.
-   Repository access permissions are restrictive.

**Resolution:** Consult the detailed console logs for the specific error code or message preceding the halt.

### "Spillover Detected" Errors

This indicates the model failed to produce pure code, outputting explanation text instead. The agent handles this by:

1.  Logging the spillover event.
2.  Initiating a prompt retry with enhanced adversarial constraints.
3.  Skipping the file if subsequent retries also fail.

**Mitigation:** Enhance clarity and specificity within custom instruction files.

### Unexpected File Skipping

If expected files are being bypassed:

-   Verify the file path does not match any patterns in the **Exclusion Registry**.
-   Check if the file size exceeds the 1MB threshold.
-   Confirm the file does not have the `.txt` protective extension.
-   Review `sovereign-todo.md` for any explicit skip directives.

---

## License

MIT License. Refer to [LICENSE](LICENSE) for full terms.

Copyright © 2026 CRAIG HUCKERBY

---

## Support and Contributions

For defect reports, inquiries, or collaboration, please utilize the official repository issue tracker.