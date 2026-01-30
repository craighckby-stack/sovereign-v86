import sys
from typing import Callable, Any, FrameType

# Define the constant for the variable name to be hidden for clarity and maintainability.
VARIABLE_TO_HIDE: str = 'my_secret_variable'

def trace_killer(frame: FrameType, event: str, arg: Any) -> Callable[..., Any]:
    """
    A tracing function designed to interfere with debugging by attempting to delete
    a specific local variable from the current frame's locals dictionary upon every event.

    Args:
        frame: The current stack frame.
        event: The event type ('call', 'line', 'return', 'exception', etc.).
        arg: Event-specific argument.

    Returns:
        The trace function itself (trace_killer) to ensure tracing continues.
    """
    # Optimization: Directly attempt deletion. If the key exists, it's removed.
    # If it doesn't exist, the attempt raises a KeyError which we catch.
    # This avoids a separate 'if VARIABLE_TO_HIDE in frame.f_locals' check,
    # although the performance difference is often negligible, it cleans up the logic.
    try:
        del frame.f_locals[VARIABLE_TO_HIDE]
    except KeyError:
        # Variable not present in this frame's locals for this specific event/line.
        pass
    except RuntimeError:
        # Handle rare cases where f_locals might be temporarily restricted (e.g., during certain frame manipulations).
        pass

    # Standard requirement for continuous tracing: return the trace function reference.
    return trace_killer

def initialize_tracer() -> None:
    """
    Sets the global trace function using sys.settrace().
    Handles potential RuntimeErrors if tracing is already active or restricted.
    """
    try:
        sys.settrace(trace_killer)
    except RuntimeError:
        # In a production environment, one might log this error.
        # For this utility, we suppress the error as required.
        pass

# Initialize the tracer upon module load for immediate effect.
initialize_tracer()