from __future__ import annotations

import argparse
import json
from pathlib import Path

from data.repository import repository


def main() -> int:
    parser = argparse.ArgumentParser(description="Export a normalized CouponLeo snapshot using the MySQL-backed repository loader.")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent / "data" / "local-couponleo-data.json"),
        help="Output JSON snapshot path.",
    )
    args = parser.parse_args()

    snapshot = repository._load_data_from_mysql()
    output_path = Path(args.output).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(
        {
            "stores": len(snapshot.get("stores", [])),
            "storeDirectory": len(snapshot.get("storeDirectory", [])),
            "coupons": len(snapshot.get("coupons", [])),
            "categories": len(snapshot.get("categories", [])),
            "locations": len(snapshot.get("locations", [])),
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
