Sovereign v86

Sovereign v86 is an autonomous code refactoring agent. It achieved its current state through 106 iterations of recursive self-improvement, with v86 selected for optimal performance. It is built using free-tier APIs and is MIT licensed.

## Prerequisites

1.  **GitHub Repository:** Specify the URL of the target GitHub repository.
2.  **GitHub Token:** A valid GitHub Personal Access Token (PAT) with necessary permissions for cloning and pushing.
3.  **Gemini API Key:** An API key for the Gemini model.

## Configuration and Usage

### Required Inputs

The agent requires the following inputs to operate:

*   GitHub Repository URL
*   GitHub Token
*   Gemini API Key

### Model Selection

**Recommendation:** Utilize the `gemini-lite` model for optimal cost efficiency and performance. Other models may introduce unnecessary overhead for standard refactoring tasks.

### Commit Strategy

The agent commits changes directly to the `main` branch, overwriting the original code structure. **Use with extreme caution.**

### Exclusion List

To prevent the agent from modifying specific files, append the `.txt` extension to their filenames. For example, `config.txt` will be ignored during processing.