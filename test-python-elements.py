"""
Test file for Element Picker feature - Python parsing
This file contains various Python constructs to verify the element picker works correctly.
"""

import os
import sys
from typing import List, Dict, Optional
from dataclasses import dataclass
from abc import ABC, abstractmethod

# Constants
API_URL = "https://api.example.com"
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30

# Simple function
def fetch_data(url: str, timeout: int = DEFAULT_TIMEOUT) -> dict:
    """Fetch data from a URL."""
    pass

# Async function
async def fetch_data_async(url: str) -> dict:
    """Async version of fetch_data."""
    pass

# Function with decorator
@staticmethod
def helper_function(x: int, y: int) -> int:
    """A helper function with decorator."""
    return x + y

# Class with inheritance
class BaseService(ABC):
    """Abstract base class for services."""

    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    def process(self, data: dict) -> dict:
        """Process the data."""
        pass

    @property
    def service_name(self) -> str:
        return self.name

# Dataclass
@dataclass
class User:
    """User data class."""
    id: int
    name: str
    email: str
    active: bool = True

# Regular class
class ApiClient(BaseService):
    """API client implementation."""

    def __init__(self, base_url: str, api_key: str):
        super().__init__("ApiClient")
        self.base_url = base_url
        self.api_key = api_key
        self._session = None

    def process(self, data: dict) -> dict:
        """Process API data."""
        return {"processed": True, **data}

    def get(self, endpoint: str) -> dict:
        """Make GET request."""
        pass

    def post(self, endpoint: str, payload: dict) -> dict:
        """Make POST request."""
        pass

    @classmethod
    def from_env(cls) -> "ApiClient":
        """Create client from environment variables."""
        return cls(
            base_url=os.getenv("API_URL", API_URL),
            api_key=os.getenv("API_KEY", "")
        )

# Generator function
def paginate_results(items: List[dict], page_size: int = 10):
    """Yield paginated results."""
    for i in range(0, len(items), page_size):
        yield items[i:i + page_size]

# Lambda stored in variable
transform_data = lambda x: {k.upper(): v for k, v in x.items()}

# Nested function
def outer_function(x: int) -> callable:
    """Function that returns a function."""
    def inner_function(y: int) -> int:
        return x + y
    return inner_function

# Context manager class
class DatabaseConnection:
    """Database connection context manager."""

    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self.connection = None

    def __enter__(self):
        self.connection = self._connect()
        return self.connection

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.connection:
            self.connection.close()

    def _connect(self):
        """Establish database connection."""
        pass

# Main execution
if __name__ == "__main__":
    client = ApiClient.from_env()
    user = User(id=1, name="Test", email="test@example.com")
    print(f"Created user: {user}")
