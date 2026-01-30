import sys
from typing import Callable, Any, FrameType, Optional

# --- Constants ---
# Define the constant for the variable name intended to be continuously deleted
# from the current frame's locals dictionary.
_TARGET_VARIABLE_NAME: str = 'my_secret_variable'


def _trace_interceptor(frame: FrameType, event: str, arg: Any) -> Optional[Callable[..., Any]]:
    """
    A tracing function registered via sys.settrace() designed to interfere with state.

    This function executes on every Python instruction event and attempts to delete
    a configured variable from the current frame's locals dictionary.

    Args:
        frame: The current stack frame object.
        event: The event type ('call', 'line', 'return', etc.).
        arg: Event-specific argument.

    Returns:
        The trace function itself to ensure tracing continues, or None to stop tracing.
    """
    # Attempt deletion using 'del' directly. This is generally preferred over 'in' checks.
    try:
        del frame.f_locals[_TARGET_VARIABLE_NAME]
    except KeyError:
        # Variable not found in this specific scope/event. This is the expected path often.
        pass
    except RuntimeError:
        # Defensive catch for interpreter restrictions on f_locals manipulation.
        pass

    # Standard requirement for continuous tracing: return the trace function reference.
    return _trace_interceptor


def initialize_tracer() -> None:
    """
    Activates the global tracing hook using sys.settrace().
    
    Handles potential RuntimeErrors if tracing is already active or restricted.
    """
    try:
        sys.settrace(_trace_interceptor)
    except RuntimeError:
        # Fails silently if tracing cannot be set (e.g., already running under a debugger
        # that locks the trace hook, or in restricted environments).
        pass


# --- Initialization ---
# Activate the tracer immediately upon module import for instant effect.
initialize_tracer()