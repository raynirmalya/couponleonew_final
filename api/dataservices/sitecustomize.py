import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None


def _load_env() -> None:
    if load_dotenv is None:
        return

    for candidate in (
        os.getenv("CPLEO_SECRETS_FILE"),
        "/etc/code-secrets/cpleo.env",
    ):
        if not candidate:
            continue
        path = Path(candidate)
        if path.is_file():
            load_dotenv(path, override=False)
            break


_load_env()
