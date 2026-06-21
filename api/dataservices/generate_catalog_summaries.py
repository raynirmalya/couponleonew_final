from __future__ import annotations

import argparse
from copy import deepcopy
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, List

from config import Config
from data.repository import CouponLeoRepository, _write_json_atomically


SUMMARY_FILES = {
    "stores": "stores-summary.json",
    "featured_stores": "featured-stores.json",
    "categories": "categories-summary.json",
    "locations": "locations-summary.json",
}


def _summary_directory() -> Path:
    return Path(__file__).resolve().parent / "data"


def _repository() -> CouponLeoRepository:
    data_file = Config.DATA_FILE or Config.DATA_SNAPSHOT_FILE
    return CouponLeoRepository(data_file)


def _build_summaries(repository: CouponLeoRepository, featured_limit: int) -> Dict[str, List[Dict[str, Any]]]:
    snapshot = repository._load_data_from_mysql()
    stores = deepcopy(snapshot.get("storeDirectory") or snapshot.get("stores") or [])
    featured_stores = deepcopy(stores[: max(1, featured_limit)])
    for item in featured_stores:
        item["featured"] = True

    categories = deepcopy(snapshot.get("categories") or [])
    locations = repository._aggregate_location_rows()

    return {
        "stores": stores,
        "featured_stores": featured_stores,
        "categories": categories,
        "locations": locations,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate CouponLeo summary JSON files from live MySQL data.")
    parser.add_argument("--featured-limit", type=int, default=48, help="Number of featured stores to snapshot.")
    args = parser.parse_args()

    repository = _repository()
    summaries = _build_summaries(repository, featured_limit=max(1, args.featured_limit))
    summary_dir = _summary_directory()
    generated_at = datetime.now(UTC).isoformat()
    counts: Dict[str, int] = {}

    for key, filename in SUMMARY_FILES.items():
        items = summaries[key]
        _write_json_atomically(summary_dir / filename, items)
        counts[key] = len(items)

    print(
        json.dumps(
            {
                "generatedAt": generated_at,
                "counts": counts,
                "summaryDirectory": str(summary_dir),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
