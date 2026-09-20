#!/usr/bin/env python3
"""Build compact category thumbnails used by the CouponLeo blog."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

DEFAULT_DIRECTORY = Path(__file__).resolve().parents[1] / 'public/assets/images/categories'


def generate(directory: Path) -> tuple[int, int]:
    created = 0
    skipped = 0
    for source in sorted(directory.glob('*.webp')):
        if source.name.endswith('-thumb.webp'):
            continue
        target = source.with_name(f'{source.stem}-thumb.webp')
        if target.exists() and target.stat().st_mtime_ns >= source.stat().st_mtime_ns:
            skipped += 1
            continue
        with Image.open(source) as image:
            thumbnail = image.copy()
            thumbnail.thumbnail((480, 480), Image.Resampling.LANCZOS)
            thumbnail.save(target, format='WEBP', quality=78, method=5)
        created += 1
    return created, skipped


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, default=DEFAULT_DIRECTORY)
    args = parser.parse_args()
    created, skipped = generate(args.directory)
    print(f'Category blog thumbnails: {created} created, {skipped} current')


if __name__ == '__main__':
    main()
