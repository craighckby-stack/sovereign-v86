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
    # Performance optimization: Check existence and delete in one atomic scope
    # if the variable is present in the current frame's locals.
    if VARIABLE_TO_HIDE in frame.f_locals:
        try:
            # Attempt to delete the variable. This directly manipulates the frame's state.
            del frame.f_locals[VARIABLE_TO_HIDE]
        except (KeyError, RuntimeError):
            # Catch potential exceptions during deletion (e.g., if f_locals is somehow
            # temporarily restricted, although rare). Suppress silently as the attempt is made.
            pass

    # Standard requirement for continuous tracing: return the trace function reference.
    return trace_killer

# --- Initialization ---

def initialize_tracer() -> None:
    """
    Sets the global trace function using sys.settrace().
    Handles potential RuntimeErrors if tracing is already active or restricted.
    """
    try:
        sys.settrace(trace_killer)
    except RuntimeError as e:
        # Log or handle the exception if tracing setup fails in a real application.
        # print(f"Warning: Could not set global tracer: {e}", file=sys.stderr)
        pass

# Initialize the tracer upon module load for immediate effect.
initialize_tracer()