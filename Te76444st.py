import sys
import warnings
from typing import Any, Callable, TYPE_CHECKING, Optional
from types import FrameType

# --- Type Hinting Setup ---

if TYPE_CHECKING:
    # Define the precise signature for sys.settrace functions (TracerFunc)
    TracerFunc = Callable[[FrameType, str, Any], Optional[Callable[..., Any]]]

# --- Configuration & State ---
# The name of the variable targeted for deletion from execution frames.
SECRET_VARIABLE_NAME: str = 'my_secret_variable'

# State variable to hold the reference to the currently active tracer function.
_current_tracer_ref: Optional['TracerFunc'] = None

# --- Internal Tracer Function ---

def _execution_state_interceptor(frame: FrameType, event: str, arg: Any) -> Optional['TracerFunc']:
    """
    [CRITICAL PERFORMANCE IMPACT] The global execution tracing hook.

    This function attempts to locate and delete the configured SECRET_VARIABLE_NAME
    from the current frame's f_locals dictionary on every execution event.

    NOTE ON EFFICACY: Due to CPython's "fast locals" optimization, modifying
    f_locals often does NOT affect the actual variable storage, making this
    mechanism generally ineffective for security cleanup.
    """
    
    locals_map = frame.f_locals
    if SECRET_VARIABLE_NAME in locals_map:
        try:
            # Attempt deletion from the frame's local dictionary view
            del locals_map[SECRET_VARIABLE_NAME]
        except RuntimeError:
            # Catch exceptions related to modifying internal frame structures,
            # especially in complex execution contexts (e.g., generator state).
            pass

    # The tracer must return a reference to itself to keep the hook active for 
    # subsequent execution events and frames.
    return _current_tracer_ref


# --- Public API ---

def activate_interceptor(warn: bool = True) -> None:
    """
    Activates the global Python execution tracing hook using sys.settrace().

    WARNING: This imposes extremely severe performance degradation (10x-100x slowdown)
    on all interpreted Python code and conflicts with debuggers/profilers.

    :param warn: If True, issues a strong RuntimeWarning detailing limitations.
    """
    global _current_tracer_ref
    
    if _current_tracer_ref is not None:
        # Already active
        return
        
    _current_tracer_ref = _execution_state_interceptor
    
    if warn:
        warnings.warn(
            (f"Activated Global Execution Interceptor targeting '{SECRET_VARIABLE_NAME}'. "
             "EXPECT SEVERE performance degradation. This approach is generally ineffective "
             "for secure memory cleanup due to CPython's optimizations."),
            RuntimeWarning,
            stacklevel=2
        )

    try:
        sys.settrace(_current_tracer_ref)
    except RuntimeError as e:
        # This catches conflicts (e.g., if a debugger or coverage tool is already active).
        warnings.warn(f"Failed to set trace hook; conflict detected: {e}", UserWarning, stacklevel=2)
        _current_tracer_ref = None # Reset state if activation failed


def deactivate_interceptor() -> None:
    """
    Deactivates the global tracing hook, restoring default interpreter execution speed.
    """
    global _current_tracer_ref
    
    if _current_tracer_ref is None:
        return # Already inactive or never started

    try:
        # Setting trace to None removes the hook entirely.
        sys.settrace(None)
    except RuntimeError:
        # Defensive catch for deactivation errors.
        pass
        
    _current_tracer_ref = None

# CRITICAL BEST PRACTICE CHANGE:
# Automatic tracing activation upon module import has been removed.
# Users must explicitly call activate_interceptor() to enable tracing,
# acknowledging the massive performance penalty and limited efficacy.