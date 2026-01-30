import sys
from typing import Any, Optional, Callable, TYPE_CHECKING
from types import FrameType

# For static analysis/clarity, though not strictly necessary for runtime.
if TYPE_CHECKING:
    # Define type hints for the tracer return signature explicitly if needed elsewhere,
    # but Callable[..., Any] suffices for sys.settrace compatibility.
    TracerFunc = Callable[[FrameType, str, Any], Optional[Callable[..., Any]]]

# Configuration Constant: Name of the variable intended for deletion from frames.
# Using CAPS_SNAKE_CASE clearly denotes a global constant.
SECRET_VARIABLE_NAME: str = 'my_secret_variable'

# Cache the tracer function reference to avoid repeated lookups/recreation,
# though in this simple case, it primarily improves readability of settrace calls.
_tracer: Callable[..., Optional[Callable[..., Any]]] = None

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
    
    # Optimization: Access f_locals directly. Modification via del is fastest.
    try:
        del frame.f_locals[SECRET_VARIABLE_NAME]
    except KeyError:
        # Target variable not present in this specific frame's locals; continue.
        pass
    except RuntimeError:
        # Frame modification restriction (e.g., C extension frames, security contexts).
        pass

    # The tracer must return itself to remain active across the next execution step.
    return _tracer


def activate_interceptor() -> None:
    """
    Activates the global Python execution tracing hook using sys.settrace().
    Handles potential RuntimeErrors if tracing is restricted.
    """
    global _tracer
    # Initialize the cached tracer reference if not already done (ensures robustness).
    if _tracer is None:
        _tracer = _execution_state_interceptor
        
    try:
        sys.settrace(_tracer)
    except RuntimeError:
        # Fails silently if the hook cannot be set (e.g., security sandbox).
        pass

def deactivate_interceptor() -> None:
    """
    Deactivates the global tracing hook by setting the trace function to None.
    Standard cleanup procedure.
    """
    try:
        sys.settrace(None)
    except RuntimeError:
        # Defensive catch, though deactivation errors are less common.
        pass


# Module Initialization: Activate tracing immediately upon import.
# Performance Note: Global execution tracing introduces overhead on every line/call.
# The setup is kept simple and direct.
activate_interceptor()