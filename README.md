# Sovereign v86: Autonomous Code Refactoring Agent

Sovereign v86 is an autonomous code refactoring agent. It achieved its current state through 106 iterations of recursive self-improvement, with v86 selected specifically for optimal performance. The agent is built using free-tier APIs and is released under the MIT license.

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

**Warning: Destructive Commit Strategy**

The agent commits changes directly to the `main` branch, overwriting the original code structure. **Use with extreme caution.** It is highly recommended to run the agent against a dedicated feature branch or a fork.

### Exclusion List

To prevent the agent from modifying specific files, append the `.txt` extension to their filenames. For example, a file named `config.txt` will be automatically ignored during processing.