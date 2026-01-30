import sys
from typing import Callable, Any, Optional
from types import FrameType

# --- Configuration Constants ---
# Standard naming for internal module-level constants.
_DELETION_TARGET_NAME: str = 'my_secret_variable'


def _execution_state_interceptor(frame: FrameType, event: str, arg: Any) -> Optional[Callable[..., Any]]:
    """
    The optimized, high-performance tracing function registered via sys.settrace().

    Executes on every Python execution event (line, call, return, exception) and 
    attempts to delete a configured variable from the current frame's local scope.

    PERFORMANCE NOTE: This function is critical path. The 'try/except' idiom 
    is used to attempt deletion instantly, minimizing overhead compared to 
    an 'in dict' check followed by a 'del' operation.

    Args:
        frame: The current stack frame object.
        event: The event type ('call', 'line', 'return', etc.).
        arg: Event-specific argument.

    Returns:
        The tracer function itself to ensure continuous tracing.
    """
    
    # 1. Attempt the deletion directly.
    try:
        # Accesses the mutable locals dictionary view of the frame.
        del frame.f_locals[_DELETION_TARGET_NAME]
    except KeyError:
        # Expected outcome when the variable is not defined in this scope/event.
        pass
    except RuntimeError:
        # Catches interpreter restrictions (e.g., trying to modify locals during 
        # specific constrained bytecode execution points).
        pass

    # 2. Requirement: Return the function reference to continue tracing.
    return _execution_state_interceptor


def activate_interceptor() -> None:
    """
    Activates the global Python execution tracing hook using sys.settrace().
    
    Fails silently if the trace hook is already set or restricted.
    """
    try:
        sys.settrace(_execution_state_interceptor)
    except RuntimeError:
        # Graceful failure if tracing is disallowed or locked.
        pass

def deactivate_interceptor() -> None:
    """
    Deactivates the global tracing hook by setting it to None. 
    (Best Practice for cleanup.)
    """
    try:
        sys.settrace(None)
    except RuntimeError:
        pass


# --- Module Initialization ---
# Immediate activation upon module import, satisfying the original requirement 
# for instant effect.
activate_interceptor()