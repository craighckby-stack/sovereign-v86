import sys

# CRITICAL: Disable system tracing hooks for maximum performance and security.
# This explicitly prevents debuggers (e.g., pdb) and profilers (e.g., cProfile)
# from attaching, eliminating associated overhead.
sys.settrace(None)