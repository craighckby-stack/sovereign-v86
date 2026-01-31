const ARCHITECT_TODO_LIST = [
  // --- Architectural Refactoring (P0: Immediate Priority) ---
  "Split monolithic App.js file: Extract constants, utilities, reducers, and custom hooks into separate files (e.g., config.js, utils.js, state/reducer.js, hooks/useApiHandlers.js).",
  "Centralize Configuration: Move all global constants (CONFIG, AI_MODELS, FILE_PATTERNS) to a dedicated 'config' module.",
  "Decouple Logging: Implement a dedicated Logger utility or React Context for `addLog` to remove it as a dependency passed through multiple layers of hooks (`useFirebaseSetup`, `useApiHandlers`, `useProcessingEngine`).",
  "Refactor `appReducer`: Break down the large switch statement into smaller, focused handler functions (e.g., `handleSetStatus`, `handleUpdateMetrics`) for clarity and testability.",

  // --- Robustness & Error Handling (P1: Critical Fixes) ---
  "Input Validation: Implement client-side validation for `targetRepo` format (owner/repo) and ensure tokens are non-empty *before* enabling the 'Initialize' button.",
  "Robust Firebase Config Check: Enhance the check for `__firebase_config` and `__initial_auth_token` to provide clearer, actionable user feedback if the build process failed to inject these variables.",
  "Improve GitHub Error Reporting: Differentiate between 404 (Repo not found/private) and 401/403 (Token permissions) errors in `discover` and `fetchFileContent` for better user diagnostics.",
  "API Response Cleanup Testing: Rigorously test the `.replace(/^```[a-z]*\n|```$/gi, '').trim()` cleanup in `callGeminiAPI` against edge cases (e.g., partial markdown, non-standard wrappers).",
  "Token Security: Implement a mechanism to clear `ghTokenRef` and `geminiKeyRef` on session reset or critical failure, preventing stale sensitive data retention.",

  // --- Performance & React Best Practices (P2: Optimization) ---
  "Optimize `useProcessingEngine` dependencies: Review dependencies for `runCycle` and `processFile` to ensure they are minimal and correctly memoized, specifically addressing the circular dependency structure involving `state.isLive`.",
  "Memoize Utility Functions: Ensure utility functions like `getPipeline` and `isRelevantFile` are either pure or memoized if they are used within React components or hooks with frequent re-renders (though currently they are defined outside the component scope, extraction is the better fix).",
  "Externalize Styling: Move the inline `<style>` tag used for hiding the scrollbar (`.log-area::-webkit-scrollbar`) into a global CSS file or use a dedicated styling solution (e.g., Tailwind utility classes if possible).",

  // --- Code Quality & Maintainability (P3: Future Proofing) ---
  "Type Safety: Introduce TypeScript to define types for `state`, `action`, `CONFIG`, and API handler inputs/outputs, significantly improving maintainability.",
  "Consistent Naming: Standardize naming conventions across the codebase (e.g., `ConfigExt` vs `CONFIG` usage in `getPipeline`).",
  "Refactor `useFirebaseSetup`: Simplify the async logic within `useEffect` to use standard promise chaining or `async/await` more cleanly, especially around `onAuthStateChanged` setup."
];