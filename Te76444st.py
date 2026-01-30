import sys
import warnings
from typing import Any, Callable, TYPE_CHECKING, Optional
from types import FrameType

# --- Configuration Constants ---

# The name of the variable targeted for deletion/cleanup from execution frames.
VARIABLE_TO_CLEANUP: str = 'my_secret_variable'

# Standardized message emphasizing the severe performance impact and efficacy limitations.
PERFORMANCE_WARNING: str = (
    f"Activated Global Execution Interceptor targeting '{VARIABLE_TO_CLEANUP}'. "
    "WARNING: EXPECT SEVERE performance degradation (10x-100x slowdown) across all "
    "interpreted Python code. This mechanism is generally ineffective for secure "
    "memory cleanup due to CPython's 'fast locals' optimization."
)

# --- Type Hinting Setup ---

if TYPE_CHECKING:
    # Defines the signature for sys.settrace functions: 
    # Callable[[frame, event, arg], Optional[new_tracer]]
    TracerFunc = Callable[[FrameType, str, Any], Optional[Callable[..., Any]]]

# --- State Management ---

# State variable holding the reference to the currently active tracer function object.
_active_tracer_hook: Optional['TracerFunc'] = None


# --- Internal Tracer Hook ---

def _variable_cleanup_hook(frame: FrameType, event: str, arg: Any) -> Optional['TracerFunc']:
    """
    [CRITICAL PERFORMANCE IMPACT POINT] The global execution tracing hook.

    This function executes on every Python event (call, line, return, exception).
    It attempts to locate and delete the configured variable name from the 
    current frame's f_locals dictionary view.

    :returns: A reference to the currently active tracer function, to maintain 
              tracing state for subsequent events/frames.
    """
    
    # Minimal overhead logic for the tracer
    locals_map = frame.f_locals
    if VARIABLE_TO_CLEANUP in locals_map:
        try:
            # Attempt deletion from the frame's local dictionary view
            del locals_map[VARIABLE_TO_CLEANUP]
        except RuntimeError:
            # Catch exceptions related to modifying internal frame structures 
            # (e.g., complex contexts like generator state).
            pass

    # Required behavior: Return the tracer function reference itself.
    return _active_tracer_hook 


# --- Public API ---

def activate_interceptor(warn: bool = True) -> None:
    """
    Activates the global Python execution tracing hook using sys.settrace().

    This hook severely degrades performance and conflicts with debuggers/profilers.
    It should only be used when absolutely necessary and understanding its limitations.

    :param warn: If True, issues a strong RuntimeWarning detailing limitations.
    """
    global _active_tracer_hook
    
    if _active_tracer_hook is not None:
        # Idempotency: Already active
        return
        
    # Store the reference to the function object
    _active_tracer_hook = _variable_cleanup_hook
    
    if warn:
        warnings.warn(
            PERFORMANCE_WARNING,
            RuntimeWarning,
            stacklevel=2
        )

    try:
        # Install the global tracer
        sys.settrace(_active_tracer_hook)
    except RuntimeError as e:
        # Conflict detected (e.g., coverage or debugger is already active)
        warnings.warn(
            f"Failed to set trace hook; conflict detected: {e}", 
            UserWarning, 
            stacklevel=2
        )
        # If activation failed, ensure state is reset
        _active_tracer_hook = None


def deactivate_interceptor() -> None:
    """
    Deactivates the global tracing hook, restoring default interpreter 
    execution speed and freeing the system resource.
    """
    global _active_tracer_hook
    
    if _active_tracer_hook is None:
        return

    try:
        # Setting trace to None removes the hook entirely.
        sys.settrace(None)
    except RuntimeError:
        # Defensive catch for deactivation errors.
        pass
        
    # Clear state reference
    _active_tracer_hook = None