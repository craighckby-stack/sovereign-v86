"""
This module is a single source file designed to demonstrate polyglot execution,
yielding different outputs when interpreted by Python, C, and Java parsers.

The C and Java source code blocks are encapsulated within this module's docstring
(a multiline string literal), which Python safely parses and ignores (since it's
not assigned to a variable or used as a function docstring).

// -----------------------------------------------------------------------------
// === C Source Code (prints 'World') ===
#include <stdio.h>
int main() {
    printf("World\n");
    return 0;
}

/*
// === Java Source Code (prints '!') ===
class PolyglotOutput {
    public static void main(String[] args) {
        System.out.println("!");
    }
}
*/
// -----------------------------------------------------------------------------
"""

# --- Python Execution ---
# Python skips the preceding docstring (string literal) and executes the remaining logic.
# Target output: "Hello"

if __name__ == '__main__':
    print("Hello")