from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from data.blog_repository import blog_repository


def main() -> int:
    parser = argparse.ArgumentParser(description="Export stored CouponLeo blog article rows from MySQL.")
    parser.add_argument("--query", default="", help="Optional text query filter.")
    parser.add_argument("--source", default="", help="Optional exact source-name filter.")
    parser.add_argument("--topic", default="", help="Optional exact topic filter.")
    parser.add_argument("--featured", action="store_true", help="Only export featured articles.")
    parser.add_argument("--limit", type=int, default=20, help="Maximum number of rows to export.")
    parser.add_argument("--output-file", default="", help="Optional JSON file path to save the exported rows.")
    args = parser.parse_args()

    if not blog_repository._db_configured():
        print("MySQL is not configured. Set the CouponLeo DB environment variables before running this script.", file=sys.stderr)
        return 1

    items, total = blog_repository.list_articles(
        query=args.query,
        source=args.source,
        topic=args.topic,
        featured=True if args.featured else None,
        page=1,
        limit=max(1, min(args.limit, 100)),
    )

    payload = {
        "total": total,
        "items": items,
    }

    if args.output_file:
        output_path = Path(args.output_file).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"saved exported rows to {output_path}")

    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
