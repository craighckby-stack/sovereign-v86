from typing import List, Callable, Final, ClassVar, NamedTuple
from dataclasses import dataclass
import sys

# --- Configuration & Constants ---

@dataclass(frozen=True, slots=True)
class Config:
    """Centralized configuration for the Ouroboros system."""
    # Using ClassVar for static constants within the configuration object provides a clean namespace.
    MAX_CYCLES: ClassVar[int] = 5  # Maximum number of full pipeline cycles to attempt
    START_LANG: ClassVar[str] = "Ruby"
    END_LANG: ClassVar[str] = "Ruby" # Defines the required final language for closure

# --- Type Definitions ---

# A transformation step is explicitly defined by its structure.
class TransformationStep(NamedTuple):
    input_lang: str
    output_lang: str
    generator: Callable[[str], str]

# History tracking for each step execution. Using a slotted, frozen dataclass for efficiency and immutability.
@dataclass(frozen=True, slots=True)
class HistoryEntry:
    cycle: int
    step_in_cycle: int
    input_lang: str
    output_lang: str
    code_length: int

# Structure for the final execution results, using NamedTuple for immutable, attribute-based access.
class ExecutionResult(NamedTuple):
    final_code: str
    cycles_run: int
    final_language: str
    transformation_history: List[HistoryEntry]
    initial_code_snippet: str
    successful_closure: bool

# Type aliases for clarity
PipelineChain = List[TransformationStep]
History = List[HistoryEntry]

# --- Helper Function ---

def extract_first_line(code: str) -> str:
    """Utility to safely extract and clean the first non-empty line of code."""
    if not code:
        return "N/A"
    
    # Use a generator expression with next() for efficiency, stopping on the first match.
    try:
        return next(line.strip() for line in code.splitlines() if line.strip())
    except StopIteration:
        return "N/A"


# --- Transformation Logic (Placeholders) ---

def generate_python_from_ruby(code: str) -> str:
    """Generates Python code from Ruby source fragment."""
    snippet: Final[str] = extract_first_line(code)
    return f"# Python generated from Ruby: '{snippet}'\n# ... rest of translation"

def generate_java_from_python(code: str) -> str:
    """Generates Java code from Python source fragment."""
    snippet: Final[str] = extract_first_line(code)
    return f"// Java public class generated from Python: '{snippet}'\n// ... rest of translation"

def closing_transformer(code: str) -> str:
    """Regenerates the starting language (Ruby) from the previous step (e.g., Java)."""
    snippet: Final[str] = extract_first_line(code)
    return f"# Ruby code successfully regenerated. Traceback: {snippet}\n# ... final output"


# --- Ouroboros System Core ---

class TransformationPipeline:
    """
    Manages and executes a defined sequence of language transformations, 
    designed to form a closed cycle (Ouroboros).
    """
    
    def __init__(self, transformations: PipelineChain):
        """
        Initializes the pipeline chain and validates its structural integrity.
        """
        if not transformations:
            raise ValueError("The transformation sequence cannot be empty.")
        
        # Use Final for attributes that should not change after initialization
        self.chain: Final[PipelineChain] = transformations
        self.chain_length: Final[int] = len(transformations)
        
        self._validate_chain_integrity()
        self._validate_ouroboros_closure()

    def _validate_chain_integrity(self) -> None:
        """
        Ensures strict language contiguity: Output(N) must match Input(N+1) and 
        the chain starts correctly.
        """
        start_lang: Final[str] = Config.START_LANG
        
        # 1. Validate chain start aligns with configuration
        if self.chain[0].input_lang != start_lang:
            raise RuntimeError(
                f"Pipeline initialization error: Chain must start with '{start_lang}' "
                f"but step 1 requires '{self.chain[0].input_lang}'."
            )

        # 2. Validate internal step transitions using zip for cleaner iteration
        for i, (current_step, next_step) in enumerate(zip(self.chain[:-1], self.chain[1:])):
            step_num = i + 1
            
            if current_step.output_lang != next_step.input_lang:
                raise RuntimeError(
                    f"Chain discontinuity detected at transition {step_num} -> {step_num + 1}: "
                    f"Output language '{current_step.output_lang}' mismatches "
                    f"next input language '{next_step.input_lang}'."
                )

    def _validate_ouroboros_closure(self) -> None:
        """Ensures the chain forms a complete cycle: last output returns to first input."""
        start_lang: Final[str] = Config.START_LANG
        end_output_lang: Final[str] = self.chain[-1].output_lang
        
        if end_output_lang != start_lang:
             raise RuntimeError(
                f"Ouroboros closure validation failed: Chain ends with '{end_output_lang}' "
                f" but the required starting/closing language is '{start_lang}'."
            )

    def execute_generation(self, initial_code: str, max_cycles: int = Config.MAX_CYCLES) -> ExecutionResult:
        """
        Runs the initial code through the transformation pipeline for a specified number of cycles.
        """
        current_code: str = initial_code
        current_language: str = Config.START_LANG
        history: History = []
        cycles_run: int = 0 

        print(f"--- Transformation Engine Initialized ---")
        print(f"Pipeline length: {self.chain_length} steps/cycle. Max Cycles: {max_cycles}\n")

        for cycle_num in range(1, max_cycles + 1):
            cycles_run = cycle_num
            
            for step_index, step in enumerate(self.chain):
                step_in_cycle: Final[int] = step_index + 1
                
                # Defensive State Check: Ensure the current language matches the step's expected input
                if step.input_lang != current_language:
                     # SystemError indicates a severe internal logic failure in the pipeline executor
                     raise SystemError(
                         f"FATAL: Internal pipeline state corrupted. Expected input language '{current_language}', "
                         f"but step {step_in_cycle} requires '{step.input_lang}' (Cycle {cycle_num})."
                     )

                # Execute transformation
                print(f"[C{cycle_num}/{step_in_cycle}] Translating {step.input_lang} -> {step.output_lang}")
                
                current_code = step.generator(current_code)
                
                # Update state and record history using the slotted dataclass
                current_language = step.output_lang
                
                history.append(HistoryEntry(
                    cycle=cycle_num,
                    step_in_cycle=step_in_cycle,
                    input_lang=step.input_lang,
                    output_lang=current_language,
                    code_length=len(current_code)
                ))
            
            # Post-cycle check: Check for successful closure
            if current_language == Config.START_LANG:
                 print(f"\nSUCCESS: Cycle {cycle_num} completed. Ouroboros closed by returning to {Config.START_LANG}.")
                 break
            else:
                 print(f"Cycle {cycle_num} completed. Current language is {current_language}. Continuing...")
        
        # Determine final closure status
        successful_closure: Final[bool] = (current_language == Config.START_LANG)
        
        if not successful_closure:
            print(f"\nWARNING: Max cycles ({max_cycles}) reached without closure. Final language is {current_language}.")

        # Return structured results
        return ExecutionResult(
            final_code=current_code,
            cycles_run=cycles_run,
            final_language=current_language,
            transformation_history=history,
            initial_code_snippet=extract_first_line(initial_code),
            successful_closure=successful_closure
        )

# --- Execution Block ---

if __name__ == "__main__":
    
    # Define the explicit chain required to form the Ouroboros (Ruby -> Python -> Java -> Ruby)
    pipeline_definition: Final[PipelineChain] = [
        TransformationStep(Config.START_LANG, "Python", generate_python_from_ruby),
        TransformationStep("Python", "Java", generate_java_from_python),
        TransformationStep("Java", Config.END_LANG, closing_transformer),
    ]

    initial_ruby_payload: Final[str] = """
# Ouroboros Initial Seed
def initialize_ouroboros
  print "Sequence 0 initiated."
end
    """

    try:
        # 1. Initialize the pipeline engine
        engine: Final[TransformationPipeline] = TransformationPipeline(pipeline_definition)
        
        # 2. Execute the chain, running exactly one cycle for demonstration.
        results: Final[ExecutionResult] = engine.execute_generation(initial_ruby_payload, max_cycles=1)

        print("\n" + "="*50)
        print("--- FINAL EXECUTION SUMMARY ---")
        print(f"Start Language/Goal: {Config.START_LANG}")
        print(f"Pipeline Steps: {engine.chain_length}")
        print(f"Start Code Snippet: {results.initial_code_snippet}")
        print(f"Cycles Run: {results.cycles_run}")
        print(f"Closure Successful: {results.successful_closure}")
        print(f"Total Transformations Executed: {len(results.transformation_history)}")
        print(f"Final Language: {results.final_language}")
        print("="*50)
        print("\n--- Final Output Code ---")
        print(results.final_code)

    except (ValueError, RuntimeError, SystemError) as e:
        # Use sys.stderr for critical errors
        print(f"\n[FATAL SYSTEM ERROR]: The Ouroboros chain failed: {e}", file=sys.stderr)
        sys.exit(1)