As the Principal Software Architect for the Sovereign v86 project, I have reviewed the current codebase and identified critical areas for immediate refactoring, robustness improvements, and long-term maintainability.

The following is the prioritized To-Do list of enhancements, errors, and bugs that require immediate attention to stabilize the agent and prepare it for future iterations.

---

## Sovereign v86: Architectural Refactoring & Enhancement Roadmap

### P0: Immediate Priority (Architectural Stability)

These items address fundamental structural flaws that impede development, testing, and long-term maintainability.

| ID | Area | Description |
| :--- | :--- | :--- |
| **A-1** | **Monolith Decomposition** | Split the monolithic `App.js` file. Extract constants, utilities, reducers, and custom hooks into dedicated, single-responsibility modules (e.g., `config.js`, `utils.js`, `state/reducer.js`, `hooks/useApiHandlers.js`). |
| **A-2** | **Configuration Centralization** | Move all global constants (`CONFIG`, `AI_MODELS`, `FILE_PATTERNS`) to a single, dedicated `config` module to ensure a single source of truth for agent parameters. |
| **A-3** | **Logging Decoupling** | Implement a dedicated Logger utility or React Context for the `addLog` function. This will eliminate the need to pass logging functionality as a dependency through multiple layers of hooks (`useFirebaseSetup`, `useApiHandlers`, `useProcessingEngine`). |
| **A-4** | **Reducer Modularity** | Refactor the large `appReducer` switch statement. Break it down into smaller, focused handler functions (e.g., `handleSetStatus`, `handleUpdateMetrics`) to improve clarity and testability of state transitions. |

### P1: Critical Fixes (Robustness and Security)

Given the **DESTRUCTIVE COMMIT STRATEGY**, robust error handling and input validation are paramount to prevent user frustration and data loss.

| ID | Area | Description |
| :--- | :--- | :--- |
| **R-1** | **Pre-Execution Input Validation** | Implement client-side validation for user inputs. Specifically, validate the `targetRepo` format (must be `owner/repo`) and ensure both the GitHub Token and Gemini Key are non-empty *before* enabling the 'Initialize' button. |
| **R-2** | **Enhanced GitHub Diagnostics** | Improve error reporting within `discover` and `fetchFileContent`. Differentiate clearly between 404 errors (Repository not found or private) and 401/403 errors (Token permissions insufficient) to provide actionable user feedback. |
| **R-3** | **API Response Integrity** | Rigorously test and harden the `.replace(/^```[a-z]*\n|```$/gi, '').trim()` cleanup logic in `callGeminiAPI`. This is critical to ensure the agent correctly parses refactored code, especially against edge cases like partial markdown or non-standard code wrappers. |
| **R-4** | **Sensitive Data Security** | Implement a mechanism to clear the contents of `ghTokenRef` and `geminiKeyRef` (or equivalent storage) upon session reset, successful completion, or critical failure, preventing the retention of stale sensitive data. |
| **R-5** | **Firebase Configuration Check** | Enhance the check for injected build variables (`__firebase_config`, `__initial_auth_token`) to provide clearer, actionable user feedback if the build process failed to inject these variables correctly. |

### P2: Optimization (Performance and React Best Practices)

These items focus on improving the agent's runtime efficiency and adhering to modern React standards.

| ID | Area | Description |
| :--- | :--- | :--- |
| **O-1** | **Processing Engine Dependency Review** | Conduct a thorough review of dependencies for `runCycle` and `processFile` within `useProcessingEngine`. Ensure dependencies are minimal and correctly memoized, specifically addressing the complex circular dependency structure involving `state.isLive`. |
| **O-2** | **Utility Function Memoization** | Ensure that utility functions like `getPipeline` and `isRelevantFile` are either strictly pure or are correctly memoized if they are used in contexts that trigger frequent re-renders within React components or hooks. |
| **O-3** | **Styling Externalization** | Move the inline `<style>` tag used for hiding the scrollbar (`.log-area::-webkit-scrollbar`) into a global CSS file or utilize a dedicated styling solution for cleaner component separation. |

### P3: Future Proofing (Code Quality and Maintainability)

These items are strategic investments in the long-term health and scalability of the Sovereign v86 codebase.

| ID | Area | Description |
| :--- | :--- | :--- |
| **Q-1** | **Type Safety Implementation** | Introduce TypeScript to the project. Define explicit types for `state`, `action`, `CONFIG`, and all API handler inputs/outputs. This is the single most effective step for improving long-term maintainability. |
| **Q-2** | **Naming Consistency** | Standardize naming conventions across the entire codebase (e.g., resolve inconsistencies like `ConfigExt` vs. `CONFIG` usage in utility functions). |
| **Q-3** | **Async Logic Simplification** | Refactor `useFirebaseSetup`. Simplify the asynchronous logic within the `useEffect` hook to use standard promise chaining or cleaner `async/await` patterns, particularly around the `onAuthStateChanged` setup. |