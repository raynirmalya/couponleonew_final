from __future__ import annotations

import argparse
import json
import os
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Dict, List

from config import Config
from data.newsletter_store import NewsletterSubscriptionStore
from data.repository import repository
from newsletter_email import render_newsletter_email


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _slugify_email(email: str) -> str:
    cleaned = []
    for char in email.lower():
        if char.isalnum():
            cleaned.append(char)
        else:
            cleaned.append("-")
    return "".join(cleaned).strip("-")


def _infer_name(email: str) -> str:
    handle = email.split("@", 1)[0]
    parts = [part for part in handle.replace("_", ".").split(".") if part]
    if not parts:
        return email
    return " ".join(part[:1].upper() + part[1:] for part in parts)


def _parse_wishlist_entries(raw_entries: List[str]) -> List[Dict[str, str]]:
    items: List[Dict[str, str]] = []
    for raw_entry in raw_entries:
        parts = [part.strip() for part in raw_entry.split("|")]
        if len(parts) < 3:
            raise ValueError(
                "Each --wishlist-entry must use the format kind|title|route|subtitle|description"
            )

        kind, title, route = parts[:3]
        subtitle = parts[3] if len(parts) > 3 else ""
        description = parts[4] if len(parts) > 4 else ""
        items.append(
            {
                "kind": kind,
                "title": title,
                "route": route,
                "subtitle": subtitle,
                "description": description,
            }
        )
    return items


def _load_smtp_settings() -> Dict[str, Any] | None:
    host = os.getenv("COUPONLEO_NEWSLETTER_SMTP_HOST", "").strip()
    from_email = os.getenv("COUPONLEO_NEWSLETTER_FROM_EMAIL", "").strip() or Config.SUPPORT_EMAIL
    if not host or not from_email:
        return None

    return {
        "host": host,
        "port": int(os.getenv("COUPONLEO_NEWSLETTER_SMTP_PORT", "587")),
        "username": os.getenv("COUPONLEO_NEWSLETTER_SMTP_USERNAME", "").strip(),
        "password": os.getenv("COUPONLEO_NEWSLETTER_SMTP_PASSWORD", "").strip(),
        "from_email": from_email,
        "from_name": os.getenv("COUPONLEO_NEWSLETTER_FROM_NAME", Config.SUPPORT_NAME).strip() or Config.SUPPORT_NAME,
        "use_ssl": os.getenv("COUPONLEO_NEWSLETTER_SMTP_SSL", "false").strip().lower() in {"1", "true", "yes", "on"},
        "use_starttls": os.getenv("COUPONLEO_NEWSLETTER_SMTP_STARTTLS", "true").strip().lower() in {"1", "true", "yes", "on"},
    }


def _send_email(
    *,
    recipient: str,
    rendered: Dict[str, str],
    smtp_settings: Dict[str, Any],
) -> None:
    message = EmailMessage()
    from_name = smtp_settings["from_name"]
    from_email = smtp_settings["from_email"]
    message["Subject"] = rendered["subject"]
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = recipient
    message.set_content(rendered["text"])
    message.add_alternative(rendered["html"], subtype="html")

    if smtp_settings["use_ssl"]:
        with smtplib.SMTP_SSL(smtp_settings["host"], smtp_settings["port"], timeout=20) as server:
            if smtp_settings["username"]:
                server.login(smtp_settings["username"], smtp_settings["password"])
            server.send_message(message)
        return

    with smtplib.SMTP(smtp_settings["host"], smtp_settings["port"], timeout=20) as server:
        server.ehlo()
        if smtp_settings["use_starttls"]:
            server.starttls()
            server.ehlo()
        if smtp_settings["username"]:
            server.login(smtp_settings["username"], smtp_settings["password"])
        server.send_message(message)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render a CouponLeo newsletter email and optionally send it through SMTP."
    )
    parser.add_argument("--email", required=True, help="Recipient email address.")
    parser.add_argument("--full-name", default="", help="Recipient full name.")
    parser.add_argument("--country", default="all", help="Preferred market, for example India or all.")
    parser.add_argument("--locale", default="en-US", help="Preferred locale, for example en-US.")
    parser.add_argument("--provider", default="email", choices=("email", "google"), help="Auth provider label.")
    parser.add_argument("--source-path", default="/dashboard", help="Origin path for the subscription record.")
    parser.add_argument(
        "--wishlist-entry",
        action="append",
        default=[],
        help="Optional wishlist seed in the format kind|title|route|subtitle|description.",
    )
    parser.add_argument(
        "--site-base-url",
        default=os.getenv("COUPONLEO_NEWSLETTER_SITE_BASE_URL", "https://couponleo.com").strip() or "https://couponleo.com",
        help="Base URL used for internal email links.",
    )
    parser.add_argument(
        "--data-file",
        default="",
        help="Optional subscription data file override. Useful when the primary JSON file is locked on Windows.",
    )
    parser.add_argument(
        "--send",
        action="store_true",
        help="Attempt SMTP delivery when COUPONLEO_NEWSLETTER_SMTP_* settings exist.",
    )
    args = parser.parse_args()

    email = args.email.strip().lower()
    full_name = args.full_name.strip() or _infer_name(email)
    wishlist_items = _parse_wishlist_entries(args.wishlist_entry)

    output_dir = Path(__file__).resolve().parents[2] / "reports"
    output_dir.mkdir(parents=True, exist_ok=True)
    data_file = args.data_file.strip() or Config.NEWSLETTER_DATA_FILE
    store = NewsletterSubscriptionStore(data_file)
    payload = {
        "email": email,
        "fullName": full_name,
        "provider": args.provider,
        "locale": args.locale.strip() or "en-US",
        "country": args.country.strip() or "all",
        "sourcePath": args.source_path.strip() or "/dashboard",
        "wishlist": wishlist_items,
    }
    try:
        subscription, preview = store.upsert_subscription(payload, repository)
    except PermissionError:
        fallback_data_file = output_dir / "newsletter_subscriptions.generated.json"
        store = NewsletterSubscriptionStore(str(fallback_data_file))
        subscription, preview = store.upsert_subscription(payload, repository)

    rendered = render_newsletter_email(subscription, preview, args.site_base_url)

    slug = _slugify_email(email)
    stamp = _utc_stamp()
    text_path = output_dir / f"couponleo-newsletter-email-{stamp}-{slug}.txt"
    html_path = output_dir / f"couponleo-newsletter-email-{stamp}-{slug}.html"
    json_path = output_dir / f"couponleo-newsletter-email-{stamp}-{slug}.json"
    text_path.write_text(rendered["text"], encoding="utf-8")
    html_path.write_text(rendered["html"], encoding="utf-8")
    json_path.write_text(
        json.dumps(
            {
                "subscription": subscription,
                "preview": preview,
                "email": {
                    "subject": rendered["subject"],
                    "preheader": rendered["preheader"],
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    delivery = "not_requested"
    if args.send:
        smtp_settings = _load_smtp_settings()
        if smtp_settings:
            _send_email(recipient=email, rendered=rendered, smtp_settings=smtp_settings)
            delivery = "sent"
        else:
            delivery = "smtp_not_configured"

    print(
        json.dumps(
            {
                "delivery": delivery,
                "email": email,
                "subject": rendered["subject"],
                "summary": preview.get("summary"),
                "text_path": str(text_path),
                "html_path": str(html_path),
                "json_path": str(json_path),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
