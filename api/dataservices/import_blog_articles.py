from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from data.blog_repository import blog_repository


def main() -> int:
    parser = argparse.ArgumentParser(description="Import scraped CouponLeo blog article records from a JSON file into MySQL.")
    parser.add_argument("input_file", help="Path to the scraped article JSON file.")
    args = parser.parse_args()

    input_path = Path(args.input_file).resolve()
    if not input_path.is_file():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 1

    if not blog_repository._db_configured():
        print("MySQL is not configured. Set the CouponLeo DB environment variables before running this script.", file=sys.stderr)
        return 1

    records = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        print("Input JSON must contain a list of article records.", file=sys.stderr)
        return 1

    stored = blog_repository.upsert_articles(records)
    print(f"stored records: {stored}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
