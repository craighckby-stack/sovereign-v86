from typing import List, Callable, Dict, Any, Final, TypedDict, NamedTuple
import sys

# --- Configuration & Constants ---

class AppConfig:
    """Centralized configuration for the Ouroboros system."""
    MAX_CYCLES: Final[int] = 5  # Maximum number of full pipeline cycles to attempt
    START_LANG: Final[str] = "Ruby"
    END_LANG: Final[str] = "Ruby"

# --- Type Definitions ---

# A transformation step is explicitly defined by its structure.
class TransformationStep(NamedTuple):
    input_lang: str
    output_lang: str
    generator: Callable[[str], str]

# History tracking for each step execution.
class HistoryEntry(TypedDict):
    cycle: int
    step_in_cycle: int
    input_lang: str
    output_lang: str
    code_length: int

# Structure for the final execution results.
class ExecutionResult(TypedDict):
    final_code: str
    cycles_run: int
    final_language: str
    transformation_history: List[HistoryEntry]
    initial_code_snippet: str
    successful_closure: bool

# --- Transformation Logic (Placeholders) ---
# In a production system, these would contain sophisticated AST manipulation or code parsers.

def generate_python_from_ruby(code: str) -> str:
    """Generates Python code from Ruby source fragment."""
    # Optimization: Using str.splitlines() directly is faster than splitting and joining or stripping multiple times.
    snippet = code.strip().splitlines()[0] if code.strip() else ""
    return f"# Python generated from Ruby: '{snippet}'..."

def generate_java_from_python(code: str) -> str:
    """Generates Java code from Python source fragment."""
    snippet = code.strip().splitlines()[0] if code.strip() else ""
    return f"// Java public class generated from Python: '{snippet}'..."

def closing_transformer(code: str) -> str:
    """Regenerates the starting language (Ruby) from the previous step (e.g., Java)."""
    snippet = code.strip().splitlines()[0] if code.strip() else ""
    return f"# Ruby code successfully regenerated. Traceback: {snippet}..."


# --- Ouroboros System Core ---

class TransformationPipeline:
    """
    Manages and executes a defined sequence of language transformations, 
    designed to form a closed cycle (Ouroboros).
    """
    
    def __init__(self, transformations: List[TransformationStep]):
        """
        Initializes the pipeline chain and validates its structural integrity.
        """
        if not transformations:
            raise ValueError("The transformation sequence cannot be empty.")
        
        self.chain: List[TransformationStep] = transformations
        self.chain_length = len(transformations)
        self._validate_chain_integrity()
        self._validate_ouroboros_closure()

    def _validate_chain_integrity(self) -> None:
        """
        Ensures strict language contiguity: Output(N) must match Input(N+1).
        This guarantees a contiguous, executable pipeline segment.
        """
        
        # 1. Validate internal step transitions
        for i in range(self.chain_length - 1):
            current_output_lang = self.chain[i].output_lang
            next_input_lang = self.chain[i+1].input_lang
            
            if current_output_lang != next_input_lang:
                raise RuntimeError(
                    f"Chain discontinuity detected at step {i+1}: "
                    f"Output language '{current_output_lang}' mismatches "
                    f"next input language '{next_input_lang}'."
                )

        # 2. Validate chain start aligns with configuration
        if self.chain[0].input_lang != AppConfig.START_LANG:
            raise RuntimeError(
                f"Pipeline initialization error: Chain must start with '{AppConfig.START_LANG}' "
                f"but step 1 requires '{self.chain[0].input_lang}'."
            )

    def _validate_ouroboros_closure(self) -> None:
        """Ensures the chain forms a complete cycle: last output returns to first input."""
        if self.chain[-1].output_lang != self.chain[0].input_lang:
             raise RuntimeError(
                f"Ouroboros closure validation failed: Chain ends with '{self.chain[-1].output_lang}' "
                f"but the starting language is '{self.chain[0].input_lang}'."
            )

    def execute_generation(self, initial_code: str, max_cycles: int = AppConfig.MAX_CYCLES) -> ExecutionResult:
        """
        Runs the initial code through the transformation pipeline for a specified number of cycles.

        Args:
            initial_code: The source code in the configured START_LANG.
            max_cycles: The maximum number of full pipeline cycles to attempt.

        Returns:
            ExecutionResult: A structured dictionary containing results and metadata.
        """
        current_code = initial_code
        current_language = AppConfig.START_LANG
        history: List[HistoryEntry] = []
        successful_closure = False
        current_cycle = 0 # Initialize cycle counter

        print(f"--- Transformation Engine Initialized ---")
        print(f"Pipeline length: {self.chain_length} steps/cycle. Max Cycles: {max_cycles}\n")

        for cycle_num in range(1, max_cycles + 1):
            current_cycle = cycle_num
            
            for step_index, step in enumerate(self.chain):
                
                # State Check (Defense in Depth)
                if step.input_lang != current_language:
                     raise SystemError(
                         f"FATAL: Internal pipeline state corrupted. Expected {current_language}, found {step.input_lang} at C{current_cycle}/S{step_index+1}."
                     )

                # Execute transformation
                print(f"[C{current_cycle}/S{step_index+1}] Translating {step.input_lang} -> {step.output_lang}")
                
                new_code = step.generator(current_code)
                
                # Update state
                current_code = new_code
                current_language = step.output_lang
                
                # Record history
                history.append(HistoryEntry(
                    cycle=current_cycle,
                    step_in_cycle=step_index + 1,
                    input_lang=step.input_lang,
                    output_lang=step.output_lang,
                    code_length=len(current_code)
                ))
            
            # Post-cycle check: Check if the language matches the START language
            if current_language == AppConfig.START_LANG:
                 print(f"\nSUCCESS: Cycle {current_cycle} completed. Ouroboros closed by returning to {AppConfig.START_LANG}.")
                 successful_closure = True
                 break
            else:
                 print(f"Cycle {current_cycle} completed. Current language is {current_language}. Continuing...")
        
        # Final summary message
        if not successful_closure:
            print(f"\nWARNING: Max cycles ({max_cycles}) reached. Final language is {current_language}.")

        # Return structured results
        return ExecutionResult(
            final_code=current_code,
            cycles_run=current_cycle,
            final_language=current_language,
            transformation_history=history,
            initial_code_snippet=initial_code.strip().splitlines()[0] if initial_code.strip() else "N/A",
            successful_closure=successful_closure
        )

# --- Execution Block ---

if __name__ == "__main__":
    
    # Define the explicit chain required to form the Ouroboros (Ruby -> Python -> Java -> Ruby)
    pipeline_definition: List[TransformationStep] = [
        TransformationStep(AppConfig.START_LANG, "Python", generate_python_from_ruby),
        TransformationStep("Python", "Java", generate_java_from_python),
        TransformationStep("Java", AppConfig.END_LANG, closing_transformer),
    ]

    initial_ruby_payload = """
# Ouroboros Initial Seed
def initialize_ouroboros
  print "Sequence 0 initiated."
end
    """

    try:
        # 1. Initialize the pipeline engine
        engine = TransformationPipeline(pipeline_definition)
        
        # 2. Execute the chain, running exactly one cycle to confirm closure.
        results: ExecutionResult = engine.execute_generation(initial_ruby_payload, max_cycles=1)

        print("\n" + "="*50)
        print("--- FINAL EXECUTION SUMMARY ---")
        print(f"Start Language/Goal: {AppConfig.START_LANG}")
        print(f"Pipeline Steps: {engine.chain_length}")
        print(f"Start Code Snippet: {results['initial_code_snippet']}")
        print(f"Cycles Run: {results['cycles_run']}")
        print(f"Closure Successful: {results['successful_closure']}")
        print(f"Total Transformations Executed: {len(results['transformation_history'])}")
        print(f"Final Language: {results['final_language']}")
        print("="*50)
        print("\n--- Final Output Code ---")
        print(results['final_code'])

    except (ValueError, RuntimeError, SystemError) as e:
        print(f"\n[FATAL SYSTEM ERROR]: The Ouroboros chain failed: {e}", file=sys.stderr)
        sys.exit(1)