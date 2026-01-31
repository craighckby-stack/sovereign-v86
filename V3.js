# Sovereign v86 Refactoring TODO List

This list outlines critical bugs, necessary enhancements, and architectural improvements identified during the self-audit of the core agent component.

## 🐛 Critical Bugs & Errors

1.  **Missing Exclusion Mechanism Implementation:** The project overview mandates excluding files by appending `.txt` (e.g., `config.json.txt`). The `discover` function currently ignores this rule, relying only on `SKIP_PATTERNS` and standard extensions. This must be fixed to respect the user's exclusion mechanism.
2.  **Recursive API Retry Stack Depth:** The `callGeminiAPI` uses recursive calls for retries. Refactor this to use an iterative `while` loop to prevent potential stack overflow issues under high retry counts.
3.  **Incomplete Log Auto-Scroll:** The log area does not automatically scroll to the newest entry, hindering real-time monitoring. Implement a `useEffect` hook to ensure the log container scrolls to the bottom when new logs are added.
4.  **Generic GitHub Commit Failure Handling:** The `processFile` function throws a generic "Commit Fail" error. Update the logic to log the specific HTTP status code and response body from the GitHub API for better debugging.

## ✨ Enhancements & Features

5.  **Mandatory Acknowledgment of Destructive Strategy:** Given the "CRITICAL WARNING" in the project overview, the UI must enforce a mandatory checkbox or confirmation step before `Engage` to prevent accidental destructive commits on the wrong branch.
6.  **Improved API Error Reporting:** Enhance `callGeminiAPI` to differentiate between specific API errors (e.g., 401 Unauthorized, 429 Rate Limit) and log them specifically instead of a generic "API failure."
7.  **Configurable Commit Message:** The commit message is currently hardcoded. Add a configuration input to allow users to define a custom prefix or template for the commit message.
8.  **Abstraction of API Keys/Tokens:** The direct use of `useRef` for sensitive inputs bypasses standard React state flow. Consider using a dedicated, ephemeral state managed by the reducer or a custom hook for better encapsulation and testability.

## 🏗️ Architectural Improvements

9.  **Component Separation:** The main `App` component is monolithic. Extract core UI sections (e.g., `LogViewer`, `ConfigPanel`, `Header`) into separate components to improve readability and maintainability.
10. **Centralized Configuration for TODO Files:** Move the hardcoded `TODO_FILE_NAMES` array into the global `CONFIG` object for centralized management.