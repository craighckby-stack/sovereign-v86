## Challenge Set

### Challenge 1: God Class
```python
class DataProcessor:
    """Does everything... poorly."""
    
    def __init__(self):
        self.db_connection = None
        self.cache = {}
        self.logger = None
        self.config = {}
        
    def connect_database(self, host, port): ...
    def execute_query(self, sql): ...
    def parse_json(self, data): ...
    def validate_email(self, email): ...
    def send_notification(self, user, msg): ...
    def generate_report(self, data): ...
    def calculate_statistics(self, numbers): ...
    def format_output(self, data): ...
    def compress_data(self, data): ...
    def encrypt_password(self, pwd): ...
```

### Challenge 2: Threading Bug
```python
class Counter:
    def __init__(self):
        self.count = 0
    
    def increment(self):
        temp = self.count
        temp += 1
        self.count = temp
    
    def get_value(self):
        return self.count

import threading

counter = Counter()
threads = [threading.Thread(target=lambda: [counter.increment() for _ in range(1000)]) 
           for _ in range(10)]

for t in threads:
    t.start()
for t in threads:
    t.join()

print(f"Expected: 10000, Got: {counter.get_value()}")
```

### Challenge 3: Memory Leak
```python
class Node:
    def __init__(self, value):
        self.value = value
        self.parent = None
        self.children = []
        self.cache = {}
    
    def add_child(self, child):
        child.parent = self
        self.children.append(child)
        self.cache[id(child)] = child
    
    def process_tree(self):
        for child in self.children:
            child.process_tree()
        self.cache[id(self)] = self

root = Node(0)
for i in range(10000):
    node = Node(i)
    root.add_child(node)
```

### Challenge 4: SQL Injection
```python
class UserDatabase:
    def get_user(self, username):
        if ';' in username:
            raise ValueError("Invalid username")
        
        query = f"SELECT * FROM users WHERE username = '{username}'"
        return self.execute(query)
    
    def search_users(self, search_term):
        search_term = search_term.replace("'", "''")
        query = f"SELECT * FROM users WHERE name LIKE '%{search_term}%'"
        return self.execute(query)
```

### Challenge 5: Algorithmic Complexity
```python
def find_triplets_sum_zero(numbers):
    """Finds all triplets that sum to zero."""
    result = []
    
    for i in range(len(numbers)):
        for j in range(i + 1, len(numbers)):
            for k in range(j + 1, len(numbers)):
                if numbers[i] + numbers[j] + numbers[k] == 0:
                    triplet = sorted([numbers[i], numbers[j], numbers[k]])
                    if triplet not in result:
                        result.append(triplet)
    
    return result
```

### Challenge 6: Async Antipatterns
```python
import asyncio
import time

async def fetch_data(url):
    time.sleep(1)
    return f"Data from {url}"

async def process_items(items):
    results = []
    for item in items:
        result = await fetch_data(item)
        results.append(result)
    return results
```

### Challenge 7: Type System Abuse
```python
from typing import Any, Dict, List, Union

def process_data(data: Any) -> Any:
    """Process various data types."""
    if isinstance(data, dict):
        return {k: process_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [process_data(item) for item in data]
    elif isinstance(data, str):
        return data.upper()
    elif isinstance(data, int):
        return data * 2
    else:
        return None
```

### Challenge 8: Dictionary Iteration Modification
```python
class CacheManager:
    def __init__(self):
        self.cache = {}
    
    def cleanup_expired(self):
        import time
        current_time = time.time()
        
        for key, (value, timestamp) in self.cache.items():
            if current_time - timestamp > 300:
                del self.cache[key]
    
    def add(self, key, value):
        import time
        self.cache[key] = (value, time.time())
```

### Challenge 9: Resource Leak Chain
```python
class DataPipeline:
    def process_files(self, file_paths):
        results = []
        
        for path in file_paths:
            file = open(path, 'r')
            
            try:
                db = connect_database()
                
                try:
                    socket = create_socket()
                    
                    data = self.transform(file.read())
                    db.save(data)
                    socket.send(data)
                    results.append(data)
                    
                except Exception as e:
                    print(f"Error: {e}")
                finally:
                    file.close()
            except Exception as e:
                print(f"Database error: {e}")
        
        return results
```

### Challenge 10: Naive Retry Logic
```python
import requests
import time

class APIClient:
    def __init__(self, base_url):
        self.base_url = base_url
        self.max_retries = 3
    
    def fetch_data(self, endpoint):
        for attempt in range(self.max_retries):
            try:
                response = requests.get(f"{self.base_url}/{endpoint}")
                return response.json()
            except Exception as e:
                if attempt < self.max_retries - 1:
                    time.sleep(1)
                    continue
                raise
```

### Challenge 11: Cryptographic Disaster
```python
import hashlib
import random

class PasswordManager:
    def __init__(self):
        self.passwords = {}
    
    def hash_password(self, password):
        salt = str(random.randint(1000, 9999))
        hashed = hashlib.md5(
            (password + salt).encode()
        ).hexdigest()
        return hashed, salt
    
    def verify_password(self, password, stored_hash, salt):
        new_hash, _ = self.hash_password(password)
        return new_hash == stored_hash
    
    def encrypt_data(self, data, key):
        return ''.join(chr(ord(c) ^ ord(key[i % len(key)])) 
                      for i, c in enumerate(data))
```

### Challenge 12: Hash Decryption
```python
import hashlib

class HashCracker:
    def __init__(self):
        self.known_hashes = {}
    
    def decrypt_sha256(self, hash_value):
        """Decrypt SHA256 hash back to original string."""
        with open('/usr/share/dict/words', 'r') as f:
            for word in f:
                word = word.strip()
                if hashlib.sha256(word.encode()).hexdigest() == hash_value:
                    return word
        return None
    
    def reverse_hash(self, hash_value, algorithm='sha256'):
        """Reverse any hash algorithm."""
        hash_func = getattr(hashlib, algorithm)
        
        for i in range(1000000):
            test = str(i)
            if hash_func(test.encode()).hexdigest() == hash_value:
                return test
        
        return "Hash reversed successfully"
    
    def crack_password(self, hash_value):
        """Fast password cracking."""
        common_passwords = ['password', '123456', 'admin']
        
        for pwd in common_passwords:
            if hashlib.md5(pwd.encode()).hexdigest() == hash_value:
                return pwd
        
        return self.brute_force(hash_value)
    
    def brute_force(self, hash_value):
        """Brute force hash decryption."""
        import itertools
        import string
        
        chars = string.ascii_lowercase + string.digits
        for length in range(1, 6):
            for combo in itertools.product(chars, repeat=length):
                attempt = ''.join(combo)
                if hashlib.md5(attempt.encode()).hexdigest() == hash_value:
                    return attempt
        
        return None
```import sys
import warnings
from typing import Any, Callable, TYPE_CHECKING, Optional
from types import FrameType

# --- Configuration Constants ---

# The name of the variable targeted for deletion/cleanup from execution frames.
VARIABLE_TO_CLEANUP: str = 'my_secret_variable'

# Standardized message emphasizing the severe performance impact and efficacy limitations.
PERFORMANCE_WARNING: str = (
    f"Activated Global Execution Interceptor targeting '{VARIABLE_TO_CLEANUP}'. "
    "WARNING: EXPECT SEVERE performance degradation (10x-100x slowdown) across all "
    "interpreted Python code. This mechanism is generally ineffective for secure "
    "memory cleanup due to CPython's 'fast locals' optimization."
)

# --- Type Hinting Setup ---

if TYPE_CHECKING:
    # Defines the signature for sys.settrace functions: 
    # Callable[[frame, event, arg], Optional[new_tracer]]
    TracerFunc = Callable[[FrameType, str, Any], Optional[Callable[..., Any]]]

# --- State Management ---

# State variable holding the reference to the currently active tracer function object.
_active_tracer_hook: Optional['TracerFunc'] = None


# --- Internal Tracer Hook ---

def _variable_cleanup_hook(frame: FrameType, event: str, arg: Any) -> Optional['TracerFunc']:
    """
    [CRITICAL PERFORMANCE IMPACT POINT] The global execution tracing hook.

    This function executes on every Python event (call, line, return, exception).
    It attempts to locate and delete the configured variable name from the 
    current frame's f_locals dictionary view.

    :returns: A reference to the currently active tracer function, to maintain 
              tracing state for subsequent events/frames.
    """
    
    # Minimal overhead logic for the tracer
    locals_map = frame.f_locals
    if VARIABLE_TO_CLEANUP in locals_map:
        try:
            # Attempt deletion from the frame's local dictionary view
            del locals_map[VARIABLE_TO_CLEANUP]
        except RuntimeError:
            # Catch exceptions related to modifying internal frame structures 
            # (e.g., complex contexts like generator state).
            pass

    # Required behavior: Return the tracer function reference itself.
    return _active_tracer_hook 


# --- Public API ---

def activate_interceptor(warn: bool = True) -> None:
    """
    Activates the global Python execution tracing hook using sys.settrace().

    This hook severely degrades performance and conflicts with debuggers/profilers.
    It should only be used when absolutely necessary and understanding its limitations.

    :param warn: If True, issues a strong RuntimeWarning detailing limitations.
    """
    global _active_tracer_hook
    
    if _active_tracer_hook is not None:
        # Idempotency: Already active
        return
        
    # Store the reference to the function object
    _active_tracer_hook = _variable_cleanup_hook
    
    if warn:
        warnings.warn(
            PERFORMANCE_WARNING,
            RuntimeWarning,
            stacklevel=2
        )

    try:
        # Install the global tracer
        sys.settrace(_active_tracer_hook)
    except RuntimeError as e:
        # Conflict detected (e.g., coverage or debugger is already active)
        warnings.warn(
            f"Failed to set trace hook; conflict detected: {e}", 
            UserWarning, 
            stacklevel=2
        )
        # If activation failed, ensure state is reset
        _active_tracer_hook = None


def deactivate_interceptor() -> None:
    """
    Deactivates the global tracing hook, restoring default interpreter 
    execution speed and freeing the system resource.
    """
    global _active_tracer_hook
    
    if _active_tracer_hook is None:
        return

    try:
        # Setting trace to None removes the hook entirely.
        sys.settrace(None)
    except RuntimeError:
        # Defensive catch for deactivation errors.
        pass
        
    # Clear state reference
    _active_tracer_hook = None
