import sys
from typing import Any, Optional, Callable
from types import FrameType

# Configuration Constant: Name of the variable intended for deletion from frames.
DELETION_TARGET_NAME: str = 'my_secret_variable'

def _execution_state_interceptor(frame: FrameType, event: str, arg: Any) -> Optional[Callable[..., Any]]:
    """
    The high-performance tracing function registered via sys.settrace().

    Attempts to delete a configured variable from the current frame's local scope
    on every execution event using direct dictionary deletion for speed.

    Args:
        frame: The current stack frame object (provides access to f_locals).
        event: The event type ('call', 'line', 'return', 'exception').
        arg: Event-specific argument.

    Returns:
        The tracer function reference to ensure continuous tracing.
    """
    
    # Direct dictionary deletion is the fastest path to remove the key if present.
    try:
        del frame.f_locals[DELETION_TARGET_NAME]
    except KeyError:
        # Target variable not present in this specific frame's locals; continue.
        pass
    except RuntimeError:
        # Handle cases where frame modification is restricted by the interpreter.
        pass

    # The tracer must return itself to remain active.
    return _execution_state_interceptor


def activate_interceptor() -> None:
    """
    Activates the global Python execution tracing hook using sys.settrace().
    Handles potential RuntimeErrors if tracing is restricted (e.g., security sandbox).
    """
    try:
        sys.settrace(_execution_state_interceptor)
    except RuntimeError:
        # Fails silently if the hook cannot be set, adhering to robust error handling.
        pass

def deactivate_interceptor() -> None:
    """
    Deactivates the global tracing hook by setting the trace function to None.
    Standard cleanup procedure.
    """
    try:
        sys.settrace(None)
    except RuntimeError:
        # Defensive catch, although deactivation errors are less common.
        pass


# Module Initialization: Activate tracing immediately upon import.
# This ensures global monitoring starts as soon as this module is loaded.
activate_interceptor()