"""Run tests and syntax checks using the project's Python interpreter."""

import compileall
import sys
import unittest
from pathlib import Path

root = Path(__file__).resolve().parents[1]
suite = unittest.defaultTestLoader.discover(str(root / "tests"))
result = unittest.TextTestRunner(verbosity=2).run(suite)
compiled = all(compileall.compile_dir(str(root / path), quiet=1) for path in ("src", "api", "scripts"))
sys.exit(0 if result.wasSuccessful() and compiled else 1)
