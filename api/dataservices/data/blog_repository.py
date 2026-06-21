from __future__ import annotations

import hashlib
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from config import Config

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:  # pragma: no cover - safe fallback for environments without MySQL support
    pymysql = None
    DictCursor = None


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", _clean_text(value).lower()).strip("-")
    return cleaned or "article"


def _sanitize_http_url(value: Any) -> str:
    raw_value = _clean_text(value)

    if not raw_value:
        return ""

    if raw_value.startswith("http://"):
        raw_value = f"https://{raw_value[len('http://'):]}"

    parsed = urlparse(raw_value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""

    return raw_value


def _to_iso(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return _clean_text(value)


def _to_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value

    raw_value = _clean_text(value)
    if not raw_value:
        return None

    normalized = raw_value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(raw_value, fmt)
            except ValueError:
                continue
    return None


def _bool_to_int(value: Any) -> int:
    if isinstance(value, bool):
        return 1 if value else 0
    return 1 if _clean_text(value).lower() in {"1", "true", "yes", "on"} else 0


class CouponleoBlogRepository:
    def _db_configured(self) -> bool:
        return all(
            [
                Config.MYSQL_HOST,
                Config.MYSQL_PORT,
                Config.MYSQL_DB,
                Config.MYSQL_USER,
                Config.MYSQL_PASSWORD,
            ]
        )

    def _connect_mysql(self):
        if pymysql is None or DictCursor is None:
            raise RuntimeError("pymysql is required for CouponLeo blog MySQL access.")

        connection_kwargs = {
            "host": Config.MYSQL_HOST,
            "port": int(Config.MYSQL_PORT),
            "user": Config.MYSQL_USER,
            "password": Config.MYSQL_PASSWORD,
            "database": Config.MYSQL_DB,
            "cursorclass": DictCursor,
            "charset": "utf8mb4",
        }

        if Config.MYSQL_SSL_REQUIRED:
            connection_kwargs["ssl"] = {"ssl": {}}

        return pymysql.connect(**connection_kwargs)

    def ensure_table(self) -> bool:
        if not self._db_configured():
            return False

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS blog_articles (
                        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                        source_name VARCHAR(160) NOT NULL,
                        source_home_url VARCHAR(1024) NOT NULL DEFAULT '',
                        article_url VARCHAR(2048) NOT NULL,
                        article_url_hash CHAR(64) NOT NULL,
                        canonical_url VARCHAR(2048) NOT NULL DEFAULT '',
                        slug VARCHAR(255) NOT NULL,
                        title VARCHAR(255) NOT NULL,
                        excerpt TEXT NULL,
                        image_url VARCHAR(2048) NOT NULL DEFAULT '',
                        author_name VARCHAR(255) NOT NULL DEFAULT '',
                        published_at DATETIME NULL,
                        topic VARCHAR(120) NOT NULL DEFAULT '',
                        language_code VARCHAR(16) NOT NULL DEFAULT '',
                        market_scope VARCHAR(120) NOT NULL DEFAULT '',
                        content_hash CHAR(64) NOT NULL DEFAULT '',
                        is_featured TINYINT(1) NOT NULL DEFAULT 0,
                        is_active TINYINT(1) NOT NULL DEFAULT 1,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        PRIMARY KEY (id),
                        UNIQUE KEY uq_blog_articles_article_url_hash (article_url_hash),
                        UNIQUE KEY uq_blog_articles_slug (slug),
                        KEY idx_blog_articles_source_name (source_name),
                        KEY idx_blog_articles_published_at (published_at),
                        KEY idx_blog_articles_active_featured (is_active, is_featured)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
            connection.commit()
        finally:
            connection.close()

        return True

    def list_articles(
        self,
        query: str = "",
        source: str = "",
        topic: str = "",
        featured: Optional[bool] = None,
        page: int = 1,
        limit: int = 12,
    ) -> tuple[List[Dict[str, Any]], int]:
        if not self.ensure_table():
            return [], 0

        safe_page = max(1, int(page or 1))
        safe_limit = max(1, min(int(limit or 12), 100))
        offset = (safe_page - 1) * safe_limit

        clauses = ["is_active = 1"]
        params: List[Any] = []

        normalized_query = _clean_text(query).lower()
        if normalized_query:
            like_term = f"%{normalized_query}%"
            clauses.append(
                "(LOWER(title) LIKE %s OR LOWER(COALESCE(excerpt, '')) LIKE %s OR LOWER(COALESCE(source_name, '')) LIKE %s)"
            )
            params.extend([like_term, like_term, like_term])

        normalized_source = _clean_text(source).lower()
        if normalized_source:
            clauses.append("LOWER(source_name) = %s")
            params.append(normalized_source)

        normalized_topic = _clean_text(topic).lower()
        if normalized_topic:
            clauses.append("LOWER(topic) = %s")
            params.append(normalized_topic)

        if featured is not None:
            clauses.append("is_featured = %s")
            params.append(1 if featured else 0)

        where_clause = " AND ".join(clauses)

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                cursor.execute(f"SELECT COUNT(1) AS total FROM blog_articles WHERE {where_clause}", params)
                total = int((cursor.fetchone() or {}).get("total") or 0)

                cursor.execute(
                    f"""
                    SELECT
                        id,
                        source_name,
                        source_home_url,
                        article_url,
                        canonical_url,
                        slug,
                        title,
                        excerpt,
                        image_url,
                        author_name,
                        published_at,
                        topic,
                        language_code,
                        market_scope,
                        is_featured,
                        is_active,
                        created_at,
                        updated_at
                    FROM blog_articles
                    WHERE {where_clause}
                    ORDER BY is_featured DESC, COALESCE(published_at, updated_at, created_at) DESC, id DESC
                    LIMIT %s OFFSET %s
                    """,
                    [*params, safe_limit, offset],
                )
                rows = cursor.fetchall()
        finally:
            connection.close()

        return [self._serialize_article(row) for row in rows], total

    def get_article(self, identifier: str) -> Optional[Dict[str, Any]]:
        if not self.ensure_table():
            return None

        target = _clean_text(identifier)
        if not target:
            return None

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        id,
                        source_name,
                        source_home_url,
                        article_url,
                        canonical_url,
                        slug,
                        title,
                        excerpt,
                        image_url,
                        author_name,
                        published_at,
                        topic,
                        language_code,
                        market_scope,
                        is_featured,
                        is_active,
                        created_at,
                        updated_at
                    FROM blog_articles
                    WHERE is_active = 1
                      AND (slug = %s OR article_url = %s OR id = %s)
                    LIMIT 1
                    """,
                    (target, target, int(target) if target.isdigit() else 0),
                )
                row = cursor.fetchone()
        finally:
            connection.close()

        return self._serialize_article(row) if row else None

    def upsert_articles(self, articles: List[Dict[str, Any]]) -> int:
        if not self.ensure_table():
            raise RuntimeError("CouponLeo blog article table requires a configured MySQL database.")

        if not articles:
            return 0

        rows = [self._normalize_article(article) for article in articles if _clean_text(article.get("title")) and _sanitize_http_url(article.get("article_url"))]
        if not rows:
            return 0

        connection = self._connect_mysql()
        try:
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO blog_articles (
                        source_name,
                        source_home_url,
                        article_url,
                        article_url_hash,
                        canonical_url,
                        slug,
                        title,
                        excerpt,
                        image_url,
                        author_name,
                        published_at,
                        topic,
                        language_code,
                        market_scope,
                        content_hash,
                        is_featured,
                        is_active
                    ) VALUES (
                        %(source_name)s,
                        %(source_home_url)s,
                        %(article_url)s,
                        %(article_url_hash)s,
                        %(canonical_url)s,
                        %(slug)s,
                        %(title)s,
                        %(excerpt)s,
                        %(image_url)s,
                        %(author_name)s,
                        %(published_at)s,
                        %(topic)s,
                        %(language_code)s,
                        %(market_scope)s,
                        %(content_hash)s,
                        %(is_featured)s,
                        %(is_active)s
                    )
                    ON DUPLICATE KEY UPDATE
                        source_name = VALUES(source_name),
                        source_home_url = VALUES(source_home_url),
                        canonical_url = VALUES(canonical_url),
                        slug = VALUES(slug),
                        title = VALUES(title),
                        excerpt = VALUES(excerpt),
                        image_url = VALUES(image_url),
                        author_name = VALUES(author_name),
                        published_at = VALUES(published_at),
                        topic = VALUES(topic),
                        language_code = VALUES(language_code),
                        market_scope = VALUES(market_scope),
                        content_hash = VALUES(content_hash),
                        is_featured = VALUES(is_featured),
                        is_active = VALUES(is_active)
                    """,
                    rows,
                )
            connection.commit()
        finally:
            connection.close()

        return len(rows)

    def _normalize_article(self, article: Dict[str, Any]) -> Dict[str, Any]:
        article_url = _sanitize_http_url(article.get("article_url"))
        source_name = _clean_text(article.get("source_name")) or "Source"
        title = _clean_text(article.get("title"))
        excerpt = _clean_text(article.get("excerpt"))
        content_fingerprint = hashlib.sha256(f"{title}\n{excerpt}".encode("utf-8")).hexdigest()
        article_url_hash = hashlib.sha256(article_url.encode("utf-8")).hexdigest()
        slug_base = f"{_slugify(source_name)}-{_slugify(title)}"

        return {
            "source_name": source_name,
            "source_home_url": _sanitize_http_url(article.get("source_home_url")),
            "article_url": article_url,
            "article_url_hash": article_url_hash,
            "canonical_url": _sanitize_http_url(article.get("canonical_url")) or article_url,
            "slug": f"{slug_base[:246]}-{article_url_hash[:8]}",
            "title": title[:255],
            "excerpt": excerpt or None,
            "image_url": _sanitize_http_url(article.get("image_url")),
            "author_name": _clean_text(article.get("author_name"))[:255],
            "published_at": _to_datetime(article.get("published_at")),
            "topic": _clean_text(article.get("topic"))[:120],
            "language_code": _clean_text(article.get("language_code"))[:16],
            "market_scope": _clean_text(article.get("market_scope"))[:120],
            "content_hash": content_fingerprint,
            "is_featured": _bool_to_int(article.get("is_featured")),
            "is_active": _bool_to_int(article.get("is_active", True)),
        }

    def _serialize_article(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": row.get("id"),
            "sourceName": _clean_text(row.get("source_name")),
            "sourceHomeUrl": _sanitize_http_url(row.get("source_home_url")),
            "articleUrl": _sanitize_http_url(row.get("article_url")),
            "canonicalUrl": _sanitize_http_url(row.get("canonical_url")),
            "slug": _clean_text(row.get("slug")),
            "title": _clean_text(row.get("title")),
            "excerpt": _clean_text(row.get("excerpt")),
            "imageUrl": _sanitize_http_url(row.get("image_url")),
            "authorName": _clean_text(row.get("author_name")),
            "publishedAt": _to_iso(row.get("published_at")),
            "topic": _clean_text(row.get("topic")),
            "languageCode": _clean_text(row.get("language_code")),
            "marketScope": _clean_text(row.get("market_scope")),
            "featured": bool(row.get("is_featured")),
            "active": bool(row.get("is_active")),
            "createdAt": _to_iso(row.get("created_at")),
            "updatedAt": _to_iso(row.get("updated_at")),
        }


blog_repository = CouponleoBlogRepository()
