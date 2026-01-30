# This file models the structure and execution flow of a self-referential
# code generation challenge ("Ouroboros") using established software architecture
# patterns, type hinting, and modular design.

from typing import List, Tuple, Callable, Dict, Any

# --- Configuration Constants ---
# Defines system boundaries and targets.
MAX_ITERATIONS = 100
STARTING_LANGUAGE = "Ruby"
ENDING_LANGUAGE = "Ruby"

# --- Type Definitions ---
# A transformation step is defined by its input language, output language, and the generator function.
TransformationStep = Tuple[str, str, Callable[[str], str]]

# --- Transformation Logic (Placeholders) ---
# In a production system, these would contain sophisticated code parsers/generators.

def ruby_to_python(code: str) -> str:
    """Simulates Ruby code generating Python code."""
    return f"# Python generated from Ruby source fragment: {code.strip()[:30]}..."

def python_to_java(code: str) -> str:
    """Simulates Python code generating Java code."""
    return f"// Java public class generated from Python: {code.strip()[:30]}..."

# --- Ouroboros System Core ---

class OuroborosCompiler:
    """
    Manages and executes the sequence of language transformations intended to 
    cycle back to the starting language.
    """

    def __init__(self, transformations: List[TransformationStep]):
        """
        Initializes the compiler chain and validates its structural integrity.
        """
        if not transformations:
            raise ValueError("Transformation sequence cannot be empty.")

        self.chain: List[TransformationStep] = transformations
        self._validate_chain_integrity()

    def _validate_chain_integrity(self) -> None:
        """
        Ensures that the output language of step N matches the input language of step N+1.
        This guarantees a contiguous, executable pipeline.
        """
        for i in range(len(self.chain) - 1):
            _, current_output_lang, _ = self.chain[i]
            next_input_lang, _, _ = self.chain[i+1]
            
            if current_output_lang != next_input_lang:
                raise RuntimeError(
                    f"Chain discontinuity at step {i}: "
                    f"Output '{current_output_lang}' mismatches next input '{next_input_lang}'."
                )

    def execute_generation(self, initial_code: str, max_steps: int = MAX_ITERATIONS) -> Dict[str, Any]:
        """
        Runs the initial code through the defined transformation pipeline for a specified number of cycles.

        Args:
            initial_code: The source code in the STARTING_LANGUAGE.
            max_steps: The maximum number of full pipeline cycles to execute.

        Returns:
            A dictionary containing the final result and execution metadata.
        """
        current_code = initial_code
        current_language = STARTING_LANGUAGE
        history: List[Dict[str, Any]] = []

        print(f"--- Compiler Initializing ---")
        print(f"Chain Length: {len(self.chain)} steps per cycle.")
        print(f"Max Cycles: {max_steps}")

        for cycle in range(max_steps):
            
            for step_index, (input_lang, output_lang, generator_func) in enumerate(self.chain):
                
                if input_lang != current_language:
                    # This should only trigger if the initial language setup is wrong, 
                    # as _validate_chain_integrity should prevent runtime mismatches within the loop.
                    raise RuntimeError(f"Runtime error: Expected {current_language} but transformer requires {input_lang}")

                # Execute transformation
                current_code = generator_func(current_code)
                current_language = output_lang
                
                history.append({
                    "cycle": cycle + 1,
                    "step_in_cycle": step_index + 1,
                    "input_lang": input_lang,
                    "output_lang": output_lang,
                    "code_length": len(current_code)
                })
            
            # Post-cycle check: Did we return to the target language?
            if current_language == ENDING_LANGUAGE:
                 print(f"\nSUCCESS: Cycle {cycle + 1} completed. Returned to {ENDING_LANGUAGE}.")
                 if cycle == 0:
                     print("Ouroboros closed in a single traversal.")
                 break
            
            if cycle + 1 == max_steps:
                print(f"\nWARNING: Max iterations ({max_steps}) reached. Final language is {current_language}.")

        return {
            "final_code": current_code,
            "iterations_run": cycle + 1 if 'cycle' in locals() else 0,
            "final_language": current_language,
            "transformation_history": history,
            "initial_code_snippet": initial_code.strip().splitlines()[0]
        }

# --- Execution Block ---

if __name__ == "__main__":
    
    # Define the explicit chain needed to fulfill the Ouroboros condition (Ruby -> ... -> Ruby)
    closing_transformer = lambda code: f"// Ruby code successfully regenerated from the previous state: {code.strip()[:30]}..."
    
    chain_of_custody: List[TransformationStep] = [
        (STARTING_LANGUAGE, "Python", ruby_to_python),
        ("Python", "Java", python_to_java),
        ("Java", STARTING_LANGUAGE, closing_transformer),
    ]

    initial_ruby_payload = """
    def ouroboros_start
      puts "Initiating self-replication sequence."
    end
    """

    try:
        compiler = OuroborosCompiler(chain_of_custody)
        
        # Run exactly one full cycle to prove the chain closes itself.
        results = compiler.execute_generation(initial_ruby_payload, max_steps=1)

        print("\n--- Execution Summary ---")
        print(f"Start Code Snippet: {results['initial_code_snippet']}")
        print(f"Total Transformations Executed: {len(results['transformation_history'])}")
        print(f"Cycles Run: {results['iterations_run']}")
        print(f"Final Language: {results['final_language']}")
        print("\n--- Final Output Code ---")
        print(results['final_code'])

    except (ValueError, RuntimeError) as e:
        print(f"\n[FATAL ERROR]: Compiler setup failed: {e}")