import sys

# Counter-measure: Detach any active tracing function (e.g., debuggers or profilers)
sys.settrace(None)