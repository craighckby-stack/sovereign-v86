# Sovereign v86: Autonomous Code Refactoring Agent

An autonomous code refactoring agent featuring adaptive custom instruction support and intelligent project management capabilities. The agent analyzes project context (derived from `README.md`), applies refactoring rules defined in custom instruction files, and dynamically maintains an AI-driven operational roadmap.

## Core Capabilities

| Feature | Description |
| :--- | :--- |
| 🤖 **AI-Powered Refactoring** | Leverages Google Gemini models for deep code analysis and quality improvement. |
| 📝 **Custom Instructions** | Enables user-defined refactoring directives via dedicated instruction files. |
| 🔄 **Auto-Updating Roadmap** | Dynamically updates the project roadmap (`sovereign-todo.md`) based on executed changes. |
| 🛡️ **Markdown Guardrails** | Enforces strict validation to prevent extraneous markdown content ('spillover') in code artifacts. |
| 📊 **Smart Queue Prioritization** | Processes artifacts in a defined logical sequence (Instructions → Code → Context). |
| 🔒 **Multi-Model Support** | Seamless integration across Lite, Stable, and Experimental model tiers. |
| 📈 **Project Context Awareness** | Informs refactoring decisions using comprehensive context derived from `README.md`. |
| ⚡ **Rate Limit Resilience** | Features automatic model tier switching for graceful API rate limit handling. |
| 🔥 **Model Health Tracking** | Continuously monitors and adapts to external API availability and health status. |

---

## Operational Setup

### Prerequisites

1.  **GitHub Repository URL:** The target repository path (e.g., `owner/repo`).
2.  **GitHub Token (PAT):** A valid Personal Access Token (PAT) with `repo` and `contents` read/write scopes.
3.  **Gemini API Key:** A valid API key for accessing the Google Gemini API.

### Agent Configuration Defaults

| Setting | Default Value | Description |
| :--- | :--- | :--- |
| **Cycle Interval** | 15 seconds | The delay between sequential file processing cycles. |
| **Max File Size** | 1MB | Maximum acceptable size for files targeted for modification. |
| **Max API Retries** | 5 | Maximum number of attempts before abandoning an API call. |
| **Log History Limit** | 60 entries | Constraint on the number of console log entries retained. |

---

## Instruction Management System

Sovereign v86 aggregates and prioritizes refactoring directives from specific instruction files located in the repository root.

### Instruction File Hierarchy (Precedence Order)

1.  `.sovereign-instructions.md`: Global, high-priority refactoring rules.
2.  `sovereign-todo.md`: Project-specific tasks, overriding global rules where specified.
3.  `instructions.md`: General, lower-priority fallback instructions.

### Instruction File Structure Example (`.sovereign-instructions.md`)

```markdown
# Sovereign Custom Instructions

## Global Directives
- Enforce JSDoc documentation for all public interfaces.
- Standardize on modern ES6+ syntax (const/let, arrow functions).
- Eliminate stray `console.log` statements.
- Implement input validation for all user-facing entry points.

## Artifact-Specific Directives

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

## Artifact Processing Sequence

The agent executes operations following this strict internal queue order:

1.  **🥇 Instruction Artifacts:** Reads and processes all instruction files. These artifacts are **read-only**.
2.  **🥈 Core Code & Configuration:** Primary targets for refactoring and mutation (e.g., `.js`, `.py`, `.ts`, `.json`).
3.  **🥉 Project Context:** `README.md` is read last to gather maximum contextual understanding. This file is **read-only** and provides final contextual input.

---

## Roadmap Evolution and Maintenance (TODO Updates)

Upon successful modification of a code artifact, the agent initiates an AI-driven update to the project roadmap (`sovereign-todo.md`).

### Update Mechanism

1.  Refactoring operation completes successfully for `<filename>`.
2.  The agent prompts the AI to synthesize the next set of required actions, reflecting the completed changes.
3.  The updated TODO markdown content is committed back to the repository.
4.  Commit messages adhere to the standardized format: `[Sovereign] Roadmap Update: <filename>`.

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

Robust measures ensure that model outputs contain only pure artifact code, free of extraneous commentary or conversational text:

-   Detection of markdown headers (e.g., `##`) in code outputs.
-   Detection of role-playing phrases (e.g., "Act as a...").
-   Contaminated outputs are rejected, triggering a retry with a more stringent prompt configuration.
-   "Spillover Detected" events are explicitly logged for user awareness and debugging.

### Exclusion Registry

Files matching the following patterns are automatically bypassed to maintain integrity and optimize performance:

-   `node_modules/` (Dependency directories)
-   `*.min.js` (Minified assets)
-   `*-lock.*` (Dependency lock files)
-   `dist/`, `build/` (Output/Build directories)
-   `.git/` (Version control metadata)
-   `*.log` (Log files)
-   **Protective Extension:** Files appended with `.txt` are treated as immutable for the current session (e.g., `.env` becomes `.env.txt`).

---

## Model Tier Selection

| Model Name | Tier | Recommended Use Case |
| :--- | :--- | :--- |
| **Flash 2.5 (Lite)** | Lite | Cost-sensitive operations on large codebases. |
| **Flash 1.5 (Stable)** | Stable | Reliable, default choice for predictable refactoring. |
| **Flash 3.0 (Experimental)** | Experimental | Advanced reasoning, accessible when features stabilize. |

**Recommendation:** Start with the `Flash 1.5 (Stable)` tier for reliability. Utilize the `Lite` tier to manage operational expenses on extensive projects.

---

## Operational Status Dashboard

The agent reports its current operational state using the following indicators:

| Status | Description |
| :--- | :--- |
| **IDLE** | Agent initialized, awaiting command execution. |
| **INDEXING** | Scanning the file system and repository structure. |
| **ANALYZING** | Currently submitting an artifact or context to the AI model. |
| **EVOLVING** | Applying AI-generated code modifications to the artifact. |
| **NEURAL STANDBY** | Paused, awaiting the next scheduled processing cycle interval. |
| **FINISHED** | All queued tasks have been completed. |

---

## Performance Metrics

The following key performance indicators (KPIs) are tracked during an active session:

-   📊 **Mutations:** Count of artifacts successfully refactored and committed.
-   📋 **Steps:** Total atomic processing actions executed by the agent.
-   ❌ **Errors:** Cumulative count of encountered operational failures.
-   ⏱️ **Latency:** Mean processing time recorded per artifact submission.
-   📈 **Progress:** Completion percentage of the current task queue.

---

## ⚠️ Critical Warning: Direct Commit Strategy

**Sovereign v86 executes commits directly onto the target branch (e.g., `main`), resulting in immediate, unconfirmed, and potentially destructive overwrites of original source code.**

### Mandatory Safety Protocols

✅ **Exercise Extreme Caution**
✅ **Target a Feature Branch or Repository Fork**
✅ **Mandatory Diff Review Prior to Merging to Main**
✅ **Maintain Regular Repository Backups**

### Recommended Operational Practices

1.  **Fork/Branch Isolation:** Always operate the agent within an isolated branch or a repository fork.
2.  **Incremental Execution:** Process files in smaller batches to maintain fine-grained control.
3.  **Thorough Review:** Critically inspect the resulting `git diff` before merging.

---

## Troubleshooting Guide

### Agent Processing Halt

**Potential Causes:**
-   GitHub API rate limit reached (renewal typically occurs within 60 seconds).
-   The active AI model is temporarily unavailable (Agent attempts automated tier fallback).
-   Invalid API Key or insufficient GitHub credentials.
-   Repository access permissions are restrictive.

**Resolution:** Consult the detailed console logs for the specific error code or message preceding the halt event.

### Model Output Contamination ('Spillover')

This indicates the model failed to produce pure code, outputting explanation text instead. The agent handles this by:

1.  Logging the spillover event.
2.  Initiating a prompt retry with enhanced adversarial constraints.
3.  Skipping the file if subsequent retries also fail.

**Mitigation:** Enhance the clarity and specificity of custom instruction files.

### Artifact Exclusion

If expected files are being bypassed:

-   Verify the file path does not match any patterns in the **Exclusion Registry**.
-   Check if the file size exceeds the 1MB threshold.
-   Confirm the file does not have the `.txt` protective extension.
-   Review the project roadmap (`sovereign-todo.md`) for any explicit skip directives.

---

## License

MIT License. Refer to [LICENSE](LICENSE) for full terms.

Copyright © 2026 CRAIG HUCKERBY

---

## Support and Contributions

For defect reports, inquiries, or collaboration, please utilize the official repository issue tracker.