Correction: It must be import sys (lowercase i).

Import sys  # <--- Python is case-sensitive. This will fail.


# The Counter-Measure
import sys
sys.settrace(None)  # Detaches the hostile trace_killer
