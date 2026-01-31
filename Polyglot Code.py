from typing import Final

"""
Polyglot Core Component (Python Implementation)

Implements the core language-specific string component required by a
polyglot execution framework.
"""

# --- Configuration ---

# The core string component value provided by this Python module.
CORE_STRING_VALUE: Final[str] = "Hello"


# --- Public API ---

def get_core_string() -> str:
    """
    Retrieves the definitive language-specific string component.

    Provides an abstraction layer over the core component value.

    Returns:
        The core string component value.
    """
    return CORE_STRING_VALUE


# --- Execution Entry Point ---

def main() -> None:
    """
    Entry point for local testing and demonstration.
    """
    print(get_core_string())


if __name__ == '__main__':
    main()