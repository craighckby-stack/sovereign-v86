import sys
from typing import Callable, Any, FrameType, Optional

# --- Configuration ---
# Define the constant for the variable name intended to be continuously deleted
# from the current frame's locals dictionary.
TARGET_VARIABLE_NAME: str = 'my_secret_variable'


def local_variable_deleter(frame: FrameType, event: str, arg: Any) -> Optional[Callable[..., Any]]:
    """
    A tracing function registered via sys.settrace() designed to interfere with state.

    This function executes on every Python instruction event (line, call, return, etc.)
    and attempts to delete a configured variable from the current frame's locals dictionary,
    effectively disrupting local state introspection (e.g., debugging).

    Args:
        frame: The current stack frame object.
        event: The event type ('call', 'line', 'return', etc.).
        arg: Event-specific argument.

    Returns:
        The trace function itself (local_variable_deleter) to ensure tracing continues,
        or None to stop tracing in the current scope.
    """
    # Attempt deletion directly. Using try/except KeyError is idiomatic and often
    # slightly more performant than checking for membership first.
    try:
        del frame.f_locals[TARGET_VARIABLE_NAME]
    except KeyError:
        # Expected outcome if the variable is not present in this specific scope/event.
        pass
    except RuntimeError:
        # Defensive catch: Handles cases where frame manipulation or f_locals access
        # might be temporarily restricted by the interpreter (e.g., during specific cleanup).
        pass

    # Standard requirement for continuous tracing: return the trace function reference.
    return local_variable_deleter


def enable_trace_interception() -> None:
    """
    Activates the global tracing hook (local_variable_deleter) using sys.settrace().
    
    Handles potential RuntimeErrors if tracing is already active or restricted by the 
    interpreter environment.
    """
    try:
        sys.settrace(local_variable_deleter)
    except RuntimeError:
        # Suppression: Tracing could not be set. In this utility context, we fail silently.
        pass


# --- Initialization Hook ---
# The tracer is initialized immediately upon module import to ensure instant activation.
enable_trace_interception()