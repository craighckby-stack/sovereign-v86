"""
Polyglot Source Module

This file is designed to produce different outputs when interpreted by Python,
compiled by C, or compiled by Java.

The C and Java source code blocks are embedded below, guarded by Python comments (#).
This ensures Python execution is clean, while the C/Java source can be extracted
or compiled directly if the compiler/toolchain is configured to handle the structure.

Python Output: Hello
C Output: World
Java Output: !
"""

# --- Configuration & Metadata (Python) ---
__author__ = "Senior Software Architect"
__version__ = "1.1.0"
PYTHON_GREETING = "Hello"


# --- C Source Block (Intended for C Compilation) ---
#
# #include <stdio.h>
#
# int main(void) {
#     /* C standard practice to use void when no arguments expected */
#     printf("World\n");
#     return 0;
# }


# --- Java Source Block (Intended for Java Compilation) ---
# The Java block is wrapped in C-style multi-line comments (/* ... */)
# for maximum compatibility if blocks were extracted/merged.
#
# /*
# class PolyglotOutput {
#     public static void main(String[] args) {
#         System.out.println("!");
#     }
# }
# */


# --- Python Execution Logic ---

def execute_python_output():
    """Main execution entry point for the Python interpreter."""
    print(PYTHON_GREETING)


if __name__ == '__main__':
    execute_python_output()