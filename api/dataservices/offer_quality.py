"""Conservative display checks; original feed/database records remain unchanged."""
from datetime import datetime, timezone
import re
from offer_verification import annotate_offers

def _text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()

def _percentages(value):
    return set(re.findall(r"(\d+(?:\.\d+)?)\s*%", _text(value)))

def prepare_offers(items, now=None):
    now = now or datetime.now(timezone.utc)
    result, seen = [], set()
    for original in items:
        item = dict(original)
        expiry = _text(item.get("expiresAt"))
        if expiry:
            try:
                parsed = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
                # Date-only feed expiries remain valid throughout their stated day.
                if parsed.date() < now.date():
                    continue
            except ValueError:
                item["expiresAt"] = None
                item["expiryIssue"] = "unreadable"
        percentages = [_percentages(item.get(key)) for key in ("title", "description", "discountText")]
        nonempty = [values for values in percentages if values]
        if len(nonempty) > 1 and not set.intersection(*nonempty):
            continue
        # Partner feeds often duplicate one promotion for each banner size.
        item["description"] = re.sub(r"[_ -]*\d{2,4}x\d{2,4}$", "", _text(item.get("description")), flags=re.I)
        key = tuple(_text(item.get(field)).casefold() for field in
                    ("storeSlug", "title", "description", "code", "location", "expiresAt"))
        if key in seen:
            continue
        seen.add(key)
        # An active feed row is not evidence of a successful checkout test.
        item["verified"] = False
        result.append(item)
    return annotate_offers(result, now=now)
