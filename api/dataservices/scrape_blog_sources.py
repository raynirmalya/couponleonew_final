from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

DEFAULT_SOURCES_FILE = Path(__file__).resolve().parent / "data" / "blog_source_catalog.json"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36 CouponLeoBot/1.0"
)
ARTICLE_PATH_HINTS = (
    "deal",
    "deals",
    "article",
    "articles",
    "blog",
    "news",
    "story",
    "stories",
    "save",
    "coupon",
    "coupons",
)
PATH_DENY_HINTS = (
    "javascript:",
    "mailto:",
    "/account",
    "/login",
    "/signup",
    "/register",
    "/terms",
    "/privacy",
    "/contact",
    "/about",
    "/careers",
    "/advertise",
    "/support",
    "/help",
    "/faq",
    "/knowledge",
    "ccpa",
    "opt-out",
    "extension",
)


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _is_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _same_registered_host(candidate_url: str, source_url: str) -> bool:
    candidate_host = (urlparse(candidate_url).hostname or "").lower()
    source_host = (urlparse(source_url).hostname or "").lower()
    if not candidate_host or not source_host:
        return False
    return candidate_host == source_host or candidate_host.endswith(f".{source_host}") or source_host.endswith(f".{candidate_host}")


def _article_candidate_score(candidate_url: str, anchor_text: str) -> int:
    parsed = urlparse(candidate_url)
    path = (parsed.path or "/").lower()
    score = 0

    if any(hint in path for hint in ARTICLE_PATH_HINTS):
        score += 4
    if path.count("/") >= 2:
        score += 2
    if len(_clean_text(anchor_text)) >= 24:
        score += 2
    if resembless_article_slug(path):
        score += 3

    return score


def _source_hint_values(source: Dict[str, Any], key: str, defaults: Iterable[str]) -> tuple[str, ...]:
    raw_value = source.get(key)
    if isinstance(raw_value, str):
        values = [_clean_text(raw_value).lower()]
    elif isinstance(raw_value, list):
        values = [_clean_text(item).lower() for item in raw_value if _clean_text(item)]
    else:
        values = []

    if not values:
        values = [_clean_text(item).lower() for item in defaults if _clean_text(item)]

    return tuple(dict.fromkeys(value for value in values if value))


def resembless_article_slug(path: str) -> bool:
    cleaned = path.strip("/")
    if not cleaned:
        return False
    segments = [segment for segment in cleaned.split("/") if segment]
    if not segments:
        return False
    slug = segments[-1]
    return slug.count("-") >= 2 or len(slug) >= 24


def load_sources(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        rows = json.load(handle)

    return [row for row in rows if row.get("enabled", True) and _is_http_url(_clean_text(row.get("home_url")))]


def create_session() -> requests.Session:
    session = requests.Session()
    session.trust_env = False
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }
    )
    return session


def fetch_html(session: requests.Session, url: str, timeout: int = 20) -> str:
    response = session.get(url, timeout=timeout)
    response.raise_for_status()
    return response.text


def discover_article_links(session: requests.Session, source: Dict[str, Any], max_links: int) -> List[str]:
    html = fetch_html(session, source["home_url"])
    soup = BeautifulSoup(html, "html.parser")
    candidates: List[tuple[int, str]] = []
    seen: Set[str] = set()
    deny_hints = _source_hint_values(source, "deny_path_hints", PATH_DENY_HINTS)
    allow_hints = _source_hint_values(source, "allow_path_hints", ())

    for node in soup.select("a[href]"):
        href = _clean_text(node.get("href"))
        if not href:
            continue

        normalized = urljoin(source["home_url"], href)
        if normalized in seen or not _is_http_url(normalized):
            continue
        if not _same_registered_host(normalized, source["home_url"]):
            continue

        lower_url = normalized.lower()
        if any(hint in lower_url for hint in deny_hints):
            continue
        if allow_hints and not any(hint in lower_url for hint in allow_hints):
            continue

        score = _article_candidate_score(normalized, node.get_text(" ", strip=True))
        if score <= 0:
            continue

        seen.add(normalized)
        candidates.append((score, normalized))

    candidates.sort(key=lambda item: (-item[0], item[1]))
    return [url for _, url in candidates[:max_links]]


def _first_meta_content(soup: BeautifulSoup, selectors: Iterable[tuple[str, str]]) -> str:
    for attr_name, attr_value in selectors:
        node = soup.find("meta", attrs={attr_name: attr_value})
        if node and _clean_text(node.get("content")):
            return _clean_text(node.get("content"))
    return ""


def _first_text(soup: BeautifulSoup, selectors: Iterable[str]) -> str:
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            text = node.get_text(" ", strip=True)
            if text:
                return text
    return ""


def extract_article_record(
    session: requests.Session,
    source: Dict[str, Any],
    article_url: str,
) -> Dict[str, Any] | None:
    try:
        html = fetch_html(session, article_url)
    except requests.RequestException:
        return None

    soup = BeautifulSoup(html, "html.parser")
    title = (
        _first_meta_content(soup, (("property", "og:title"), ("name", "twitter:title")))
        or _first_text(soup, ("h1", "title"))
    )
    if not title:
        return None

    excerpt = (
        _first_meta_content(soup, (("property", "og:description"), ("name", "description"), ("name", "twitter:description")))
        or _first_text(soup, ("article p", "main p", "p"))
    )
    image_url = _first_meta_content(soup, (("property", "og:image"), ("name", "twitter:image")))
    canonical_url = ""
    canonical_node = soup.select_one('link[rel="canonical"]')
    if canonical_node:
        canonical_url = urljoin(article_url, _clean_text(canonical_node.get("href")))

    published_at = _first_meta_content(
        soup,
        (
            ("property", "article:published_time"),
            ("name", "article:published_time"),
            ("itemprop", "datePublished"),
        ),
    )
    if not published_at:
        time_node = soup.select_one("time[datetime]")
        if time_node:
            published_at = _clean_text(time_node.get("datetime"))

    author_name = _first_meta_content(
        soup,
        (
            ("name", "author"),
            ("property", "article:author"),
        ),
    ) or _first_text(soup, (".author", "[rel='author']", "[itemprop='author']"))

    html_node = soup.select_one("html")
    language_code = _clean_text(html_node.get("lang")) if html_node else ""

    return {
        "source_name": source["name"],
        "source_home_url": source["home_url"],
        "article_url": article_url,
        "canonical_url": canonical_url or article_url,
        "title": title,
        "excerpt": excerpt,
        "image_url": image_url,
        "author_name": author_name,
        "published_at": published_at,
        "topic": _clean_text(source.get("topic")),
        "language_code": language_code,
        "market_scope": _clean_text(source.get("market_scope")),
        "is_featured": False,
        "is_active": True,
    }


def scrape_sources(
    sources: List[Dict[str, Any]],
    max_links_per_source: int,
    source_filter: str = "",
) -> List[Dict[str, Any]]:
    session = create_session()
    results: List[Dict[str, Any]] = []
    normalized_filter = _clean_text(source_filter).lower()

    for source in sources:
        if normalized_filter and normalized_filter not in _clean_text(source.get("name")).lower():
            continue

        print(f"[source] {source['name']} -> {source['home_url']}")
        try:
            article_links = discover_article_links(session, source, max_links_per_source)
        except requests.RequestException as error:
            print(f"  ! skipped: {error}")
            continue

        print(f"  discovered {len(article_links)} candidate links")
        for article_url in article_links:
            article = extract_article_record(session, source, article_url)
            if article is None:
                continue
            results.append(article)

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape CouponLeo editorial/deal sources into the blog_articles table.")
    parser.add_argument("--sources-file", default=str(DEFAULT_SOURCES_FILE), help="Path to the blog source catalog JSON file.")
    parser.add_argument("--source", default="", help="Only scrape sources whose name contains this value.")
    parser.add_argument("--max-links", type=int, default=6, help="Max article-like links to inspect per source.")
    parser.add_argument("--dry-run", action="store_true", help="Print the extracted records without storing them.")
    parser.add_argument("--output-file", default="", help="Optional JSON file to save the extracted records.")
    args = parser.parse_args()

    sources_path = Path(args.sources_file).resolve()
    if not sources_path.is_file():
        print(f"Sources file not found: {sources_path}", file=sys.stderr)
        return 1

    sources = load_sources(sources_path)
    records = scrape_sources(sources, max(1, args.max_links), args.source)

    if args.output_file:
        output_path = Path(args.output_file).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
        print(f"saved extracted records to {output_path}")

    if args.dry_run:
        print(json.dumps(records[: min(10, len(records))], indent=2))
        print(f"dry-run records: {len(records)}")
        return 0

    from data.blog_repository import blog_repository

    if not blog_repository._db_configured():
        print("MySQL is not configured. Set the CouponLeo DB environment variables before running this script.", file=sys.stderr)
        return 1

    inserted = blog_repository.upsert_articles(records)
    print(f"stored records: {inserted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
