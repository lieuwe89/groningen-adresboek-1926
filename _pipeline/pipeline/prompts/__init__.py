"""
Static registry of LLM prompt templates used by the pipeline.

Why this exists:
    The runtime dispatch in ``pipeline.llm.process_page_with_gemini`` reads
    prompt files by name (``f"{section_type}.txt"``). That dispatch is dynamic,
    so neither static-analysis tools nor a knowledge-graph extractor sees the
    link from ``llm.py`` to the individual prompt files. This module gives that
    link a static home: every prompt the pipeline can dispatch is listed in
    ``PROMPT_FILES``, and ``llm.py`` imports + validates this dict at module
    load.

Adding a new prompt:
    1. Drop the ``.txt`` template next to this ``__init__.py``.
    2. Register the section key + filename in ``PROMPT_FILES`` below.
    3. (Optional) Add a section-type → prompt-filename row in
       ``pipeline.config.SECTION_MAP`` if it should auto-dispatch for a page
       range.

See also:
    - ``pipeline.config.PROMPTS_DIR`` — the filesystem location.
    - ``pipeline.config.SECTION_MAP`` — page-range → prompt mapping.
    - ``pipeline.llm.load_prompt`` — runtime loader with caching.
"""

from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent

# Every prompt template the pipeline knows about, keyed by section type.
# Filenames are relative to PROMPTS_DIR.
PROMPT_FILES: dict[str, str] = {
    "advertisement": "advertisement.txt",
    "classify_section": "classify_section.txt",
    "generic": "generic.txt",
    "institutional": "institutional.txt",
    "name_register": "name_register.txt",
    "occupation_register": "occupation_register.txt",
    "patient_register": "patient_register.txt",
    "street_register": "street_register.txt",
}


def get_prompt_path(name: str) -> Path:
    """Return the absolute path of a registered prompt template.

    Raises:
        KeyError: if ``name`` is not in ``PROMPT_FILES``.
    """
    if name not in PROMPT_FILES:
        raise KeyError(
            f"Unknown prompt {name!r}. Registered: {sorted(PROMPT_FILES)}"
        )
    return PROMPTS_DIR / PROMPT_FILES[name]


def validate_registry() -> None:
    """Raise ``FileNotFoundError`` if any registered prompt is missing on disk.

    Called once at ``pipeline.llm`` module load so renames or deletions of
    prompt files fail loudly at import time instead of silently at dispatch.
    """
    missing = [
        name for name, fname in PROMPT_FILES.items()
        if not (PROMPTS_DIR / fname).exists()
    ]
    if missing:
        raise FileNotFoundError(
            f"Registered prompts missing from {PROMPTS_DIR}: {missing}"
        )


__all__ = ["PROMPTS_DIR", "PROMPT_FILES", "get_prompt_path", "validate_registry"]
