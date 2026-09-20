#!/usr/bin/env python3
"""Publish the public blog feed independently of the busy catalog API."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys

from dotenv import load_dotenv

SOURCE_ROOT = Path(__file__).resolve().parents[2]
API_ROOT = SOURCE_ROOT / 'api/dataservices'
OUTPUT = Path('/srv/couponleo-seo-data/articles.json')
SECRETS = Path('/etc/code-secrets/cpleo.env')


def main() -> None:
    if SECRETS.is_file():
        load_dotenv(SECRETS, override=False)
    sys.path.insert(0, str(API_ROOT))
    from data.blog_repository import blog_repository

    items, total = blog_repository.list_articles(page=1, limit=18)
    if not items:
        raise RuntimeError('No active public articles returned; keeping prior snapshot')
    payload = {
        'data': items,
        'items': items,
        'total': total,
        'page': 1,
        'pageSize': 18,
        'pageCount': max(1, (total + 17) // 18),
        'hasNextPage': total > 18,
        'hasPreviousPage': False,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_name(f'.{OUTPUT.name}.{os.getpid()}.tmp')
    try:
        with temporary.open('w', encoding='utf-8') as file:
            json.dump(payload, file, ensure_ascii=False, separators=(',', ':'))
        os.replace(temporary, OUTPUT)
    finally:
        temporary.unlink(missing_ok=True)
    print(f'Blog article snapshot synced: {len(items)} shown, {total} active')


if __name__ == '__main__':
    main()
