# Sovereign v86: Autonomous Code Refactoring Agent

Sovereign v86 is an autonomous code refactoring agent. Developed through 106 iterations of recursive self-improvement, v86 was selected for its optimal performance profile. The agent utilizes free-tier APIs and is released under the MIT license.

---

## Prerequisites

To operate Sovereign v86, the following three inputs are required:

1.  **GitHub Repository URL:** The URL of the target repository.
2.  **GitHub Token:** A valid Personal Access Token (PAT) with necessary permissions for cloning and pushing changes.
3.  **Gemini API Key:** A valid API key for the Gemini model.

## Configuration and Usage

### Model Selection

**Recommendation:** Utilize the `gemini-lite` model. This model provides optimal cost efficiency and performance. Other models may introduce unnecessary overhead for standard refactoring tasks.

### Commit Strategy

**🚨 CRITICAL WARNING: DESTRUCTIVE COMMIT STRATEGY 🚨**

Sovereign v86 commits changes directly to the target branch (e.g., `main`), **overwriting the original code structure without confirmation.**

**ACTION REQUIRED:** Use with extreme caution. It is mandatory to run the agent against a dedicated feature branch or a repository fork to prevent irreversible data loss.

### Exclusion List

To exclude specific files from the refactoring process, append the `.txt` extension to their filenames. This is the agent's designated exclusion mechanism.

*Example:* A file named `config.txt` will be automatically ignored during processing.