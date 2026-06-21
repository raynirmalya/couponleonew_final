from __future__ import annotations

from html import escape
from typing import Any, Dict


def _country_label(country: str) -> str:
    normalized = str(country or "").strip()
    if not normalized or normalized.lower() == "all":
        return "All Markets"
    return normalized


def _locale_label(locale: str) -> str:
    normalized = str(locale or "").strip()
    if not normalized:
        return "en-US"
    return normalized


def _display_name(subscription: Dict[str, Any]) -> str:
    full_name = str(subscription.get("fullName") or "").strip()
    if full_name:
        return full_name

    email = str(subscription.get("email") or "").strip()
    handle = email.split("@", 1)[0] if "@" in email else email
    parts = [part for part in handle.replace("_", ".").split(".") if part]
    if not parts:
        return "there"
    return " ".join(part[:1].upper() + part[1:] for part in parts)


def _absolute_url(site_base_url: str, route: str) -> str:
    base = str(site_base_url or "").strip().rstrip("/")
    safe_route = str(route or "").strip()
    if not base:
        base = "https://couponleo.com"
    if safe_route.startswith("http://") or safe_route.startswith("https://"):
        return safe_route
    if not safe_route.startswith("/"):
        safe_route = f"/{safe_route}"
    return f"{base}{safe_route}"


def build_subject(preview: Dict[str, Any]) -> str:
    audience = preview.get("audience") or {}
    country = _country_label(str(audience.get("country") or "all"))
    item_count = len(preview.get("items") or [])
    return f"Your CouponLeo alerts for {country}: {item_count} curated deals"


def build_preheader(preview: Dict[str, Any]) -> str:
    audience = preview.get("audience") or {}
    locale = _locale_label(str(audience.get("locale") or "en-US"))
    wishlist_count = int(audience.get("wishlistCount") or 0)
    return (
        f"Verified coupons matched to your market and {locale} preference"
        if wishlist_count <= 0
        else f"Verified coupons matched to your market, wishlist, and {locale} preference"
    )


def render_text_email(subscription: Dict[str, Any], preview: Dict[str, Any], site_base_url: str) -> str:
    audience = preview.get("audience") or {}
    country = _country_label(str(audience.get("country") or "all"))
    locale = _locale_label(str(audience.get("locale") or "en-US"))
    wishlist_count = int(audience.get("wishlistCount") or 0)
    name = _display_name(subscription)

    greeting_line = (
        f"Here are today's CouponLeo picks for your {country} market."
        if country != "All Markets"
        else "Here are today's CouponLeo picks across all markets."
    )

    lines = [
        f"Hi {name},",
        "",
        greeting_line,
        "",
        "We curated these alerts using:",
        f"- your selected region: {country}",
        f"- your language preference: {locale}",
        f"- your wishlist signals: {wishlist_count} saved item{'s' if wishlist_count != 1 else ''}",
        "",
        "Top picks for you",
        "",
    ]

    for item in preview.get("items") or []:
        lines.extend(
            [
                str(item.get("title") or "Featured deal"),
                f"Store: {item.get('storeName') or 'CouponLeo Featured'}",
                "Why you are seeing this:",
                *[f"- {reason}" for reason in (item.get("reasons") or [])[:3]],
                f"CTA: View Deal -> {_absolute_url(site_base_url, item.get('route') or '/top-deals')}",
                "",
            ]
        )

    lines.extend(
        [
            "Your alert summary",
            str(preview.get("summary") or "").strip(),
            "",
            "Manage your alerts:",
            f"- Alerts: {_absolute_url(site_base_url, '/alerts')}",
            f"- Wishlist: {_absolute_url(site_base_url, '/wishlist')}",
            f"- Settings: {_absolute_url(site_base_url, '/settings')}",
            "",
            "Thanks,",
            "CouponLeo",
        ]
    )
    return "\n".join(lines).strip() + "\n"


def render_html_email(subscription: Dict[str, Any], preview: Dict[str, Any], site_base_url: str) -> str:
    audience = preview.get("audience") or {}
    country = _country_label(str(audience.get("country") or "all"))
    locale = _locale_label(str(audience.get("locale") or "en-US"))
    wishlist_count = int(audience.get("wishlistCount") or 0)
    name = escape(_display_name(subscription))

    greeting_line = (
        f"Here are today's CouponLeo picks for your <strong>{escape(country)}</strong> market."
        if country != "All Markets"
        else "Here are today's CouponLeo picks across <strong>all markets</strong>."
    )

    card_markup = []
    for item in preview.get("items") or []:
        reasons = "".join(f"<li>{escape(str(reason))}</li>" for reason in (item.get("reasons") or [])[:3])
        href = _absolute_url(site_base_url, item.get("route") or "/top-deals")
        card_markup.append(
            f"""
            <tr>
              <td style="padding:0 0 16px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7ecf6;border-radius:20px;background:#f8fbff;">
                  <tr>
                    <td style="padding:20px;">
                      <div style="font-size:13px;font-weight:700;color:#ff7a3d;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:8px;">{escape(str(item.get('storeName') or 'CouponLeo Featured'))}</div>
                      <div style="font-size:24px;line-height:1.2;font-weight:800;color:#15244a;margin-bottom:10px;">{escape(str(item.get('title') or 'Featured deal'))}</div>
                      <div style="font-size:15px;color:#61708f;margin-bottom:14px;">{escape(str(item.get('discountText') or item.get('location') or 'Verified coupon'))}</div>
                      <div style="font-size:14px;font-weight:700;color:#15244a;margin-bottom:8px;">Why you are seeing this</div>
                      <ul style="padding-left:18px;margin:0 0 18px 0;color:#61708f;font-size:14px;line-height:1.6;">
                        {reasons}
                      </ul>
                      <a href="{escape(href)}" style="display:inline-block;padding:12px 18px;border-radius:14px;background:#2f6df6;color:#ffffff;text-decoration:none;font-weight:800;">View Deal</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            """.strip()
        )

    cards = "\n".join(card_markup)
    summary = escape(str(preview.get("summary") or "").strip())
    alerts_url = escape(_absolute_url(site_base_url, "/alerts"))
    wishlist_url = escape(_absolute_url(site_base_url, "/wishlist"))
    settings_url = escape(_absolute_url(site_base_url, "/settings"))

    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{escape(build_subject(preview))}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#15244a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(build_preheader(preview))}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 24px 60px rgba(18,35,77,0.08);">
            <tr>
              <td style="padding:32px;background:linear-gradient(135deg,#123984 0%,#2f6df6 70%,#4d8bff 100%);color:#ffffff;">
                <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;margin-bottom:12px;">CouponLeo Newsletter</div>
                <div style="font-size:34px;line-height:1.05;font-weight:800;margin-bottom:12px;">Curated savings for {escape(country)}</div>
                <div style="font-size:16px;line-height:1.6;max-width:34rem;opacity:0.94;">{greeting_line}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px 28px;">
                <p style="margin:0 0 14px 0;font-size:16px;line-height:1.7;">Hi {name},</p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#61708f;">We curated these alerts using your selected region, your <strong>{escape(locale)}</strong> language preference, and <strong>{wishlist_count}</strong> wishlist signal{'s' if wishlist_count != 1 else ''}.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 8px 28px;">
                <div style="font-size:22px;font-weight:800;color:#15244a;margin-bottom:16px;">Top picks for you</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 8px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  {cards}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:22px;background:#fff7ef;border:1px solid rgba(255,122,61,0.18);">
                  <tr>
                    <td style="padding:20px;">
                      <div style="font-size:20px;font-weight:800;color:#15244a;margin-bottom:8px;">Your alert summary</div>
                      <div style="font-size:15px;line-height:1.7;color:#61708f;margin-bottom:14px;">{summary}</div>
                      <div style="font-size:14px;font-weight:700;color:#15244a;margin-bottom:8px;">Manage your alerts</div>
                      <div style="font-size:14px;line-height:1.8;">
                        <a href="{alerts_url}" style="color:#2f6df6;font-weight:800;text-decoration:none;">Open Alerts</a>
                        <span style="color:#c9d3e6;padding:0 8px;">|</span>
                        <a href="{wishlist_url}" style="color:#2f6df6;font-weight:800;text-decoration:none;">Open Wishlist</a>
                        <span style="color:#c9d3e6;padding:0 8px;">|</span>
                        <a href="{settings_url}" style="color:#2f6df6;font-weight:800;text-decoration:none;">Update Settings</a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def render_newsletter_email(subscription: Dict[str, Any], preview: Dict[str, Any], site_base_url: str) -> Dict[str, str]:
    return {
        "subject": build_subject(preview),
        "preheader": build_preheader(preview),
        "text": render_text_email(subscription, preview, site_base_url),
        "html": render_html_email(subscription, preview, site_base_url),
    }
