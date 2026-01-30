import sys
from typing import Callable, Any, Optional, Type
from types import FrameType

# --- Configuration Constants ---
# Using ALL_CAPS for module-level constants adhering to PEP 8.
DELETION_TARGET_NAME: str = 'my_secret_variable'


def _execution_state_interceptor(frame: FrameType, event: str, arg: Any) -> Optional[Callable[..., Any]]:
    """
    The high-performance tracing function registered via sys.settrace().

    Attempts to delete a configured variable from the current frame's local scope
    on every execution event.

    PERFORMANCE NOTE: Direct dictionary key deletion (`del frame.f_locals[...]`)
    is used to minimize overhead compared to explicit checks (`if key in dict:`).

    Args:
        frame: The current stack frame object.
        event: The event type ('call', 'line', 'return', 'exception').
        arg: Event-specific argument.

    Returns:
        The tracer function reference to ensure continuous tracing.
    """
    
    # Attempt deletion directly to handle the target variable removal instantly.
    try:
        # Accessing f_locals is generally fast, as it's a dictionary view.
        del frame.f_locals[DELETION_TARGET_NAME]
    except KeyError:
        # The variable was not present in this specific frame's locals. Ignore.
        pass
    except RuntimeError:
        # Catches potential interpreter-level restrictions on frame modification.
        pass

    # Tracing requires returning the tracer function itself to remain active.
    return _execution_state_interceptor


def activate_interceptor() -> None:
    """
    Activates the global Python execution tracing hook using sys.settrace().
    Fails silently if tracing is restricted (e.g., inside frozen executables
    or certain environments).
    """
    try:
        sys.settrace(_execution_state_interceptor)
    except RuntimeError:
        # Graceful exit if the hook cannot be set.
        pass

def deactivate_interceptor() -> None:
    """
    Deactivates the global tracing hook by setting it to None.
    This is the standard cleanup procedure.
    """
    try:
        sys.settrace(None)
    except RuntimeError:
        # Should be rare for deactivation, but handled defensively.
        pass


# --- Module Initialization ---
# Activate tracing immediately upon import, ensuring global monitoring starts 
# as soon as this module is loaded.
activate_interceptor()