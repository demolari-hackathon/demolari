"""Run the website and assessment API locally without third-party packages."""

import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api.assess import handler

if __name__ == "__main__":
    print("Agent Checkup: http://localhost:8000", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8000), handler).serve_forever()
