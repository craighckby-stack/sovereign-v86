import threading
import weakref
import time
import random
import asyncio
import itertools
import string
import hashlib
import requests
import warnings
import os
from contextlib import ExitStack
from requests.exceptions import RequestException
from typing import Any, Dict, List, Union, Callable, TypeVar, Optional, Tuple

# NOTE ON EXTERNAL DEPENDENCIES:
# The refactored solution for Challenge 11 requires the 'bcrypt' library 
# (pip install bcrypt) for secure password handling, as standard Python libs 
# do not offer suitable high-level secure hashing functions.

## Challenge 1: God Class -> Modular Architecture

class DatabaseService:
    """Handles connection and queries related to the database."""
    def __init__(self, host: str, port: int):
        self._host = host
        self._port = port
        self.connection = None
    
    def connect(self):
        # Real connection logic here
        pass
    
    def execute_query(self, sql: str, params: Optional[Tuple] = None):
        # Use parameterized queries for security
        pass

class ValidationService:
    """Handles data validation and parsing."""
    @staticmethod
    def parse_json(data: str) -> Dict[str, Any]:
        # Robust JSON parsing
        return {}
        
    @staticmethod
    def validate_email(email: str) -> bool:
        # Proper regex validation
        return True 

class BusinessLogicService:
    """Handles core computation and reporting."""
    @staticmethod
    def calculate_statistics(numbers: List[Union[int, float]]):
        return {}
        
    @staticmethod
    def generate_report(data: Dict) -> str:
        return "Report content"

# DataProcessor is now the orchestrator, not the executor
class ApplicationOrchestrator:
    def __init__(self, db_config, notification_service, utility_service):
        self.db = DatabaseService(**db_config)
        self.notifier = notification_service
        self.utils = utility_service
        # Other services injected via dependency injection

## Challenge 2: Threading Bug -> Concurrency Safety

class ThreadSafeCounter:
    """
    A counter implementation that ensures atomicity using a threading.Lock.
    """
    def __init__(self):
        self.count = 0
        self._lock = threading.Lock()
    
    def increment(self):
        # Use the lock as a context manager to ensure release
        with self._lock:
            self.count += 1
    
    def get_value(self):
        # Reading usually doesn't need a lock unless consistency with other
        # operations is required, but locking ensures visibility if necessary.
        with self._lock:
            return self.count

# --- Demonstration of Fix ---
SAFE_COUNT_TARGET = 10000
safe_counter = ThreadSafeCounter()
threads = [threading.Thread(target=lambda: [safe_counter.increment() for _ in range(1000)]) 
           for _ in range(10)]

for t in threads:
    t.start()
for t in threads:
    t.join()

# print(f"Expected: {SAFE_COUNT_TARGET}, Got: {safe_counter.get_value()}")

## Challenge 3: Memory Leak (Circular References) -> Weak References

class Node:
    """
    Tree structure node using weak references for parent pointers 
    to prevent reference cycles and memory leaks when the tree structure
    is internally complete but externally abandoned.
    """
    def __init__(self, value):
        self.value = value
        # Use a private attribute to store the weak reference
        self._parent: Optional[weakref.ReferenceType] = None
        self.children = []
    
    @property
    def parent(self):
        # Access the parent object via the weak reference if it exists
        return self._parent() if self._parent else None
        
    def add_child(self, child: 'Node'):
        # Store parent as a weak reference to 'self'
        child._parent = weakref.ref(self)
        self.children.append(child)
    
    def process_tree(self):
        for child in self.children:
            child.process_tree()

# The leak is avoided because the 'parent' reference is weak, allowing 
# the Garbage Collector to clean up nodes once they are no longer reachable
# externally (even if the internal cycle exists).

## Challenge 4: SQL Injection -> Parameterized Queries

class SecureUserDatabase:
    """Simulates secure database interaction using parameter placeholders."""
    
    def _execute(self, query: str, params: Optional[Tuple] = None) -> List[Dict]:
        """Placeholder for secure execution using DB API (e.g., cursor.execute)."""
        # print(f"Executing: {query} with params: {params}")
        return []

    def get_user(self, username: str):
        # Parameterized query (using %s placeholder common in many Python DB APIs)
        query = "SELECT * FROM users WHERE username = %s"
        return self._execute(query, (username,))
    
    def search_users(self, search_term: str):
        # Wildcards applied outside the search parameter ensures the input
        # is treated purely as data, not code.
        search_param = f"%{search_term}%"
        query = "SELECT * FROM users WHERE name LIKE %s"
        return self._execute(query, (search_param,))

## Challenge 5: Algorithmic Complexity (O(N^3) -> O(N^2))

def find_triplets_sum_zero(numbers: List[int]) -> List[List[int]]:
    """
    Finds all unique triplets that sum to zero using sorting (O(N log N)) 
    and the two-pointer technique (O(N^2) overall).
    """
    numbers.sort()
    n = len(numbers)
    result = []
    
    for i in range(n - 2):
        # Optimization 1: Skip positive numbers, as the sum must be zero
        if numbers[i] > 0:
            break
            
        # Optimization 2: Skip duplicates for the fixed element 'i'
        if i > 0 and numbers[i] == numbers[i-1]:
            continue
            
        left, right = i + 1, n - 1
        target = -numbers[i]
        
        while left < right:
            current_sum = numbers[left] + numbers[right]
            
            if current_sum == target:
                result.append([numbers[i], numbers[left], numbers[right]])
                
                # Optimization 3: Skip duplicates for the 'left' and 'right' pointers
                while left < right and numbers[left] == numbers[left + 1]:
                    left += 1
                while left < right and numbers[right] == numbers[right - 1]:
                    right -= 1
                    
                left += 1
                right -= 1
            elif current_sum < target:
                left += 1
            else: # current_sum > target
                right -= 1
                
    return result

## Challenge 6: Async Antipatterns -> Concurrent Awaitables

async def fetch_data_async(url: str):
    """Simulates asynchronous I/O using asyncio.sleep."""
    # Never use time.sleep in an async function; use await asyncio.sleep()
    await asyncio.sleep(1) 
    return f"Data from {url} (concurrently processed)"

async def process_items_concurrently(items: List[str]):
    """Runs I/O tasks concurrently using asyncio.gather."""
    # Create tasks (futures)
    tasks = [fetch_data_async(item) for item in items]
    
    # Wait for all tasks to complete, maximizing concurrency
    results = await asyncio.gather(*tasks)
    return results

# Example Usage: asyncio.run(process_items_concurrently(["url1", "url2", "url3"]))

## Challenge 7: Type System Abuse -> Clear Typing and Strategy Pattern

T = TypeVar('T')
DataInput = Union[Dict[str, 'DataInput'], List['DataInput'], str, int, float]
DataOutput = Union[Dict[str, 'DataOutput'], List['DataOutput'], str, int, float, None]

def _process_string(data: str) -> str:
    return data.upper()

def _process_integer(data: int) -> int:
    return data * 2

def _process_float(data: float) -> float:
    return data * 1.5

# Strategy mapping for clarity and extensibility
PROCESSORS: Dict[type, Callable[[Any], Any]] = {
    str: _process_string,
    int: _process_integer,
    float: _process_float,
}

def process_typed_data(data: DataInput) -> DataOutput:
    """Processes structured data recursively based on defined type strategies."""
    
    if isinstance(data, dict):
        return {k: process_typed_data(v) for k, v in data.items()}
    
    if isinstance(data, list):
        return [process_typed_data(item) for item in data]
        
    processor = PROCESSORS.get(type(data))
    if processor:
        return processor(data)
    
    # Handle unlisted/complex types gracefully
    return None

## Challenge 8: Dictionary Iteration Modification -> Safe Iteration

class SafeCacheManager:
    """Manages cache cleanup by iterating over a copy of keys before deletion."""
    
    def __init__(self):
        self.cache: Dict[Any, Tuple[Any, float]] = {}
        # In a multi-threaded app, this must use a threading.Lock
    
    def cleanup_expired(self):
        current_time = time.time()
        expired_keys = []
        
        # Safe iteration: Iterate over items and collect keys to delete
        for key, (_, timestamp) in self.cache.items():
            if current_time - timestamp > 300: # 5 minutes expiry
                expired_keys.append(key)
                
        # Perform deletions outside the iteration loop
        for key in expired_keys:
            del self.cache[key]
    
    def add(self, key, value):
        self.cache[key] = (value, time.time())

## Challenge 9: Resource Leak Chain -> Context Managers (with and ExitStack)

# --- Mock Resource Helpers (for demonstration of resource handling) ---
def connect_database():
    class MockDB:
        def save(self, data): pass
        def __enter__(self): return self
        def __exit__(self, exc_type, exc_val, exc_tb): pass
    return MockDB()

def create_socket():
    class MockSocket:
        def send(self, data): pass
        def __enter__(self): return self
        def __exit__(self, exc_type, exc_val, exc_tb): pass
    return MockSocket()
# --------------------------------------------------------------------

class ReliableDataPipeline:
    
    def transform(self, raw_data):
        return raw_data.strip().upper() 
        
    def process_files(self, file_paths: List[str]):
        results = []
        
        for path in file_paths:
            # ExitStack manages multiple context managers, guaranteeing cleanup 
            # even if an exception occurs mid-way through resource acquisition.
            with ExitStack() as stack:
                try:
                    # Resource 1: File (guaranteed closure)
                    # Note: Using `with open(...)` is cleaner if only one resource, 
                    # but ExitStack demonstrates robust chaining.
                    file = stack.enter_context(open(path, 'r'))
                    
                    # Resource 2: Database connection
                    db = stack.enter_context(connect_database())
                    
                    # Resource 3: Network socket
                    sock = stack.enter_context(create_socket())
                    
                    # --- Execution ---
                    data = self.transform(file.read())
                    db.save(data)
                    sock.send(data)
                    results.append(data)
                    
                except FileNotFoundError:
                    warnings.warn(f"File not found: {path}", UserWarning)
                except Exception as e:
                    # Log specific operational errors
                    warnings.warn(f"Operational error processing {path}: {e}", UserWarning)
                
        return results

## Challenge 10: Naive Retry Logic -> Exponential Backoff

class ReliableAPIClient:
    MAX_RETRIES = 5
    INITIAL_BACKOFF = 0.5  # seconds

    def __init__(self, base_url):
        self.base_url = base_url
    
    def fetch_data(self, endpoint: str):
        for attempt in range(self.MAX_RETRIES):
            try:
                url = f"{self.base_url}/{endpoint}"
                # Always use a timeout for network operations
                response = requests.get(url, timeout=10) 
                
                # Use raise_for_status() to handle 4xx and 5xx responses gracefully
                response.raise_for_status() 
                return response.json()
            
            except RequestException as e:
                # Decide if the error is retryable (e.g., connection error, 503)
                # In a real system, you'd check response status codes (e.g., if e.response.status_code != 404)
                
                if attempt == self.MAX_RETRIES - 1:
                    # Last attempt failed, raise the final exception
                    print(f"Final attempt failed for {endpoint}.")
                    raise

                # Calculate exponential backoff with jitter
                delay = self.INITIAL_BACKOFF * (2 ** attempt) + (random.random() * 0.5)
                print(f"Attempt {attempt + 1} failed. Retrying in {delay:.2f}s...")
                time.sleep(delay)

## Challenge 11: Cryptographic Disaster -> Secure Hashing (BCrypt)

# NOTE: Requires `bcrypt` library (pip install bcrypt)

try:
    import bcrypt
    
    class SecurePasswordManager:
        """Uses modern, secure hashing (bcrypt) for password storage."""
        
        def hash_password(self, password: str) -> str:
            """Generates a secure hash including a unique salt."""
            password_bytes = password.encode('utf-8')
            # bcrypt gensalt generates a salt; hashpw performs the hashing.
            # The result is stored as a single string containing salt, cost, and hash.
            hashed_password = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
            return hashed_password.decode('utf-8')

        def verify_password(self, password: str, stored_hash: str) -> bool:
            """Safely verifies a password against a stored hash."""
            password_bytes = password.encode('utf-8')
            stored_hash_bytes = stored_hash.encode('utf-8')
            
            # checkpw handles salt extraction and comparison securely
            return bcrypt.checkpw(password_bytes, stored_hash_bytes)

except ImportError:
    warnings.warn("bcrypt library not found. Secure hashing demonstration disabled.", RuntimeWarning)
    class SecurePasswordManager:
        def hash_password(self, password: str) -> str: return "bcrypt_missing"
        def verify_password(self, password: str, stored_hash: str) -> bool: return False

# Note on encryption: For data encryption, use AES via libraries like 'cryptography.fernet'. 
# The original XOR cipher is cryptographically unsound and removed.

## Challenge 12: Hash Decryption -> Security Principle & Audit Tool

class HashAuditor:
    """
    Utility for auditing hash security. Explicitly recognizes that hashes 
    are one-way (not reversible). Methods simulate common cracking techniques.
    """
    
    def __init__(self):
        self.known_hashes: Dict[str, str] = {} 

    def attempt_dictionary_lookup(self, hash_value: str, algorithm: str = 'sha256') -> Optional[str]:
        """Attempts to reverse hash using a small dictionary of common words."""
        
        hash_func = getattr(hashlib, algorithm.lower(), None)
        if hash_func is None:
            raise ValueError(f"Unsupported hash algorithm: {algorithm}")
            
        # Example common words (replace with large wordlist in real audit)
        common_words = ['password', '123456', 'admin', 'qwerty', 'test']
        
        for word in common_words:
            if hash_func(word.encode()).hexdigest() == hash_value:
                return word
        return None
    
    def brute_force(self, hash_value: str, algorithm: str = 'md5') -> Optional[str]:
        """Performs brute force cracking for short passwords."""
        
        hash_func = getattr(hashlib, algorithm.lower(), None)
        if hash_func is None:
            raise ValueError(f"Unsupported hash algorithm: {algorithm}")
            
        chars = string.ascii_lowercase + string.digits
        MAX_LENGTH = 5 
        
        for length in range(1, MAX_LENGTH + 1):
            for combo in itertools.product(chars, repeat=length):
                attempt = ''.join(combo)
                
                # Check speed efficiency of hashing routine
                if hash_func(attempt.encode()).hexdigest() == hash_value:
                    return attempt
        
        return None