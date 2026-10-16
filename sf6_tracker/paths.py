"""Keep writable runtime files separate from source and resources."""
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def runtime_directory():
    override = os.environ.get('SF6_TRACKER_RUNTIME_DIR')
    base = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else PROJECT_ROOT
    directory = Path(override).expanduser() if override else base / 'runtime'
    directory.mkdir(parents=True, exist_ok=True)
    return directory
