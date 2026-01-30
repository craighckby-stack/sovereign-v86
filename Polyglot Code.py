"""
This module serves as a polyglot source file, designed to produce different outputs
when interpreted by Python, C, and Java compilers/interpreters.

The C and Java source code blocks are embedded within this module's primary docstring.
Python ignores this docstring; C and Java parsers utilize their respective blocks.
"""

# --- Configuration & Metadata ---
# Constants are generally preferred over raw literals for clarity.
FILE_DESCRIPTION = "Polyglot Code Execution Demonstrator"
PYTHON_OUTPUT = "Hello"

# --- C Source Block (Starts after Python docstring) ---
# This block is commented out in Python but intended for C compilation.
#
# #include <stdio.h>
# int main() {
#     printf("World\n");
#     return 0;
# }

# --- Java Source Block (Embedded within docstring comments) ---
# /*
# class PolyglotOutput {
#     public static void main(String[] args) {
#         System.out.println("!");
#     }
# }
# */

# --- Python Execution Logic ---
# Python execution starts here, skipping the preceding docstring.

if __name__ == '__main__':
    """
    Main execution block for Python.
    If this file is run directly via the Python interpreter, it prints 'Hello'.
    """
    print(PYTHON_OUTPUT)