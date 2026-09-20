"""Private, rate-limited shopper reports for operator review.

Reports are signals for review. They never change an offer's verified status.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
from pathlib import Path
import secrets
import sqlite3

from offer_verification import fingerprint, offer_key


class OfferFeedbackStore:
    def __init__(self, database: str | Path | None = None):
        self.database = Path(database or os.getenv(
            'COUPONLEO_FEEDBACK_DB', '/var/lib/couponleo-verification/feedback.sqlite3'
        ))

    def _secret(self) -> bytes:
        self.database.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        path = self.database.parent / 'feedback-secret'
        try:
            with path.open('xb') as handle:
                handle.write(secrets.token_bytes(32))
            if os.name != 'nt':
                path.chmod(0o600)
        except FileExistsError:
            pass
        return path.read_bytes()

    def record(self, offer: dict, outcome: str, client_ip: str, now: datetime | None = None) -> bool:
        if outcome not in {'worked', 'did_not_work'}:
            raise ValueError('Choose worked or did_not_work.')
        key = offer_key(offer)
        if not key:
            raise ValueError('An identifiable offer is required.')
        now = now or datetime.now(timezone.utc)
        reporter = hmac.new(self._secret(), client_ip.encode('utf-8'), hashlib.sha256).hexdigest()
        cutoff = (now - timedelta(hours=24)).isoformat()
        self.database.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with sqlite3.connect(self.database, timeout=5) as connection:
            connection.execute('''CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                offer_key TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                outcome TEXT NOT NULL,
                reporter_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )''')
            connection.execute('CREATE INDEX IF NOT EXISTS reports_offer ON reports(offer_key, created_at DESC)')
            connection.execute('CREATE INDEX IF NOT EXISTS reports_reporter ON reports(reporter_hash, created_at DESC)')
            connection.execute('BEGIN IMMEDIATE')
            duplicate = connection.execute('''SELECT 1 FROM reports
                WHERE offer_key = ? AND reporter_hash = ? AND created_at > ? LIMIT 1''',
                (key, reporter, cutoff)).fetchone()
            if duplicate:
                return False
            count = connection.execute('''SELECT COUNT(*) FROM reports
                WHERE reporter_hash = ? AND created_at > ?''', (reporter, cutoff)).fetchone()[0]
            if count >= 10:
                raise ValueError('Too many reports today. Please try again tomorrow.')
            connection.execute('''INSERT INTO reports
                (offer_key, fingerprint, outcome, reporter_hash, created_at) VALUES (?, ?, ?, ?, ?)''',
                (key, fingerprint(offer), outcome, reporter, now.isoformat()))
            connection.execute('DELETE FROM reports WHERE created_at < ?',
                               ((now - timedelta(days=90)).isoformat(),))
        if os.name != 'nt':
            self.database.chmod(0o600)
        return True
