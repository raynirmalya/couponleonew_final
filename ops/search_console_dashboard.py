#!/usr/bin/env python3
"""Turn a Search Console Coverage export ZIP into a private, static dashboard.

The export is data, not instructions. No account credentials or network access are used.
"""

from __future__ import annotations

import argparse
import csv
from html import escape
from io import StringIO
import json
from pathlib import Path
from zipfile import ZipFile


def read_csv(archive: ZipFile, name: str) -> list[dict[str, str]]:
    if name not in archive.namelist():
        return []
    raw = archive.read(name).decode('utf-8-sig', errors='replace')
    return list(csv.DictReader(StringIO(raw)))


def number(value: str | None) -> int:
    try:
        return int((value or '').replace(',', ''))
    except ValueError:
        return 0


def trend_svg(rows: list[dict[str, str]]) -> str:
    values = [(row['Date'], number(row.get('Indexed'))) for row in rows if row.get('Indexed')]
    if not values:
        return '<p>No index trend was included in this export.</p>'
    values = values[-90:]
    width, height, pad = 780, 220, 28
    ceiling = max(count for _, count in values) or 1
    scale_x = (width - pad * 2) / max(1, len(values) - 1)
    points = ' '.join(f'{pad + i * scale_x:.1f},{height - pad - count / ceiling * (height - pad * 2):.1f}'
                      for i, (_, count) in enumerate(values))
    first, last = escape(values[0][0]), escape(values[-1][0])
    return (f'<svg viewBox="0 0 {width} {height}" role="img" aria-labelledby="trend-title trend-desc">'
            f'<title id="trend-title">Indexed pages over time</title>'
            f'<desc id="trend-desc">From {first} to {last}; latest count {values[-1][1]:,}.</desc>'
            f'<line x1="{pad}" y1="{height-pad}" x2="{width-pad}" y2="{height-pad}" stroke="#cbd5e1"/>'
            f'<polyline points="{points}" fill="none" stroke="#2355f6" stroke-width="4" stroke-linejoin="round"/>'
            f'<text x="{pad}" y="{height-5}" font-size="13">{first}</text>'
            f'<text x="{width-pad}" y="{height-5}" text-anchor="end" font-size="13">{last}</text></svg>')


def render_table(title: str, rows: list[dict[str, str]], limit: int = 20) -> str:
    if not rows:
        return ''
    headers = list(rows[0])
    head = ''.join(f'<th scope="col">{escape(label)}</th>' for label in headers)
    body = ''.join('<tr>' + ''.join(f'<td>{escape(str(row.get(label, "")))}</td>' for label in headers) + '</tr>'
                   for row in rows[:limit])
    return (f'<section><h2>{escape(title)}</h2><div class="table-wrap"><table><thead><tr>{head}</tr></thead>'
            f'<tbody>{body}</tbody></table></div></section>')


def build_dashboard(archive_path: Path) -> tuple[str, dict]:
    with ZipFile(archive_path) as archive:
        chart = read_csv(archive, 'Chart.csv')
        issues = read_csv(archive, 'Critical issues.csv')
        performance = {name: read_csv(archive, name) for name in ('Pages.csv', 'Queries.csv', 'Countries.csv')}
    dated = [row for row in chart if row.get('Indexed') or row.get('Not indexed')]
    latest = dated[-1] if dated else {}
    issue_counts = {row.get('Reason', ''): number(row.get('Pages')) for row in issues}
    summary = {
        'exportDate': latest.get('Date', 'Unknown'),
        'indexed': number(latest.get('Indexed')),
        'notIndexed': number(latest.get('Not indexed')),
        'notFound': issue_counts.get('Not found (404)', 0),
        'serverErrors': issue_counts.get('Server error (5xx)', 0),
        'discoveredNotIndexed': issue_counts.get('Discovered - currently not indexed', 0),
        'source': archive_path.name,
    }
    cards = [
        ('Indexed pages', summary['indexed']),
        ('Not indexed', summary['notIndexed']),
        ('404 URLs', summary['notFound']),
        ('5xx URLs', summary['serverErrors']),
    ]
    card_html = ''.join(f'<article class="metric"><span>{escape(label)}</span><strong>{value:,}</strong></article>'
                        for label, value in cards)
    issue_rows = sorted(issues, key=lambda row: number(row.get('Pages')), reverse=True)
    extra = ''.join(render_table(name[:-4] + ' performance', rows) for name, rows in performance.items())
    if not extra:
        extra = '<p class="notice">This ZIP has Coverage counts only. Export Search Console Performance by page, query, and country to add those views.</p>'
    html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CouponLeo Search Console snapshot</title><style>
:root{{font-family:system-ui,sans-serif;color:#172544;background:#f5f7fb}}body{{max-width:1100px;margin:auto;padding:32px 18px}}
h1{{font-size:clamp(2rem,5vw,3rem);margin:.2em 0}}p{{line-height:1.6}}.eyebrow{{color:#2355f6;font-weight:800;text-transform:uppercase;letter-spacing:.08em}}
.metrics{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:26px 0}}.metric,section{{background:#fff;border:1px solid #dfe5f0;border-radius:18px;padding:20px}}
.metric span{{display:block;color:#596780}}.metric strong{{display:block;font-size:2rem;margin-top:8px}}section{{margin:18px 0}}svg{{max-width:100%;height:auto}}
.table-wrap{{overflow:auto}}table{{border-collapse:collapse;width:100%}}th,td{{text-align:left;padding:10px;border-bottom:1px solid #e3e7ef}}th{{background:#f5f7fb}}
.notice{{background:#fff8e8;border-left:4px solid #e08b15;padding:14px}}footer{{color:#66728a;font-size:.9rem}}
@media(max-width:700px){{.metrics{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}
</style></head><body><span class="eyebrow">Private export dashboard</span><h1>CouponLeo Search Console</h1>
<p>Coverage snapshot through <strong>{escape(summary['exportDate'])}</strong>. This file reflects the supplied export; it does not update automatically.</p>
<div class="metrics">{card_html}</div><section><h2>Indexed page trend</h2>{trend_svg(chart)}</section>
{render_table('Coverage issues', issue_rows, 30)}<section><h2>Search performance</h2>{extra}</section>
<footer>Source: {escape(summary['source'])}. Counts are Search Console observations, not a live URL crawl.</footer></body></html>'''
    return html, summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('coverage_zip', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--summary-json', type=Path)
    args = parser.parse_args()
    html, summary = build_dashboard(args.coverage_zip)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html, encoding='utf-8')
    if args.summary_json:
        args.summary_json.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
