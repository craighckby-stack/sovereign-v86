# Sovereign v86

An autonomous code refactoring agent that improved itself through 106 iterations of recursive self-improvement (rolled back to v86 for optimal performance). Built on free-tier APIs and MIT Licensed.

## Prerequisites

1.  **GitHub Repository:** Specify the target GitHub repository URL.
2.  **GitHub Token:** A valid GitHub Personal Access Token (PAT) with necessary permissions for cloning and pushing.
3.  **Gemini API Key:** An API key for the Gemini model.

## Configuration and Usage

### Usage Workflow

The agent requires the following inputs:

*   GitHub Repository URL
*   GitHub Token
*   Gemini API Key

### Model Selection

**Recommendation:** Utilize the `gemini-lite` model for optimal cost efficiency and performance. Other models may introduce unnecessary overhead for standard refactoring tasks.

### Commit Strategy

The agent commits changes directly to the `main` branch, overwriting the original code structure. **Use with caution.**

### Exclusion List

To prevent modification of specific files, append the `.txt` extension to their filenames (e.g., `config.txt` will be ignored).