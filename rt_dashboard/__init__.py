import logging
import importlib
import subprocess
import sys

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# pip packages required by this module.
# Format: [(pip_package_name, import_name), ...]
# Add entries here when a new dependency is introduced.
# ---------------------------------------------------------------------------
_PIP_DEPENDENCIES = [
    ('anthropic', 'anthropic'),   # Anthropic Claude SDK (LLM service)
]


def _ensure_pip_packages():
    """Install missing pip packages at module load time.

    Tries to import each declared dependency; if the import fails it runs
    ``pip install`` and retries once.  A failed install is logged as a
    warning so Odoo continues loading — services that need the package
    must handle ImportError gracefully at call time.
    """
    for pip_name, import_name in _PIP_DEPENDENCIES:
        try:
            importlib.import_module(import_name)
        except ImportError:
            _logger.info(
                'odoo_rt_dashboard: installing missing dependency "%s" …', pip_name
            )
            try:
                subprocess.check_call(
                    [sys.executable, '-m', 'pip', 'install', pip_name, '--quiet'],
                    stdout=subprocess.DEVNULL,
                )
                importlib.import_module(import_name)
                _logger.info(
                    'odoo_rt_dashboard: "%s" installed successfully.', pip_name
                )
            except Exception as exc:
                _logger.warning(
                    'odoo_rt_dashboard: could not install "%s": %s. '
                    'Some features may be unavailable.',
                    pip_name, exc,
                )


_ensure_pip_packages()

from . import models
from . import controllers
