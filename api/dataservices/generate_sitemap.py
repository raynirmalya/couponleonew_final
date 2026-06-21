import os
import re
import unicodedata
import mysql.connector
from datetime import datetime
from xml.etree.ElementTree import Element, SubElement, ElementTree
from dotenv import load_dotenv

load_dotenv()

# ---------------- CONFIG ----------------
BASE_URL = "https://jsundefined.com"
OUT_DIR = "./sitemaps"
LANG = "en"

os.makedirs(OUT_DIR, exist_ok=True)
TODAY = datetime.utcnow().strftime("%Y-%m-%d")

# ---------------- ENCODING (MATCHES FLASK EXACTLY) ----------------
ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
BASE = len(ALPHABET)
SECRET_XOR = 0xA5F3F5A2A1F1
SALT_ADD  = 0x9F22C8D4A7B1
MIN_LEN = 32

def base62_encode(num: int) -> str:
    if num == 0:
        return ALPHABET[0]
    out = []
    while num > 0:
        num, rem = divmod(num, BASE)
        out.append(ALPHABET[rem])
    return "".join(reversed(out))

def encode_id(num_id: int) -> str:
    mixed = (num_id ^ SECRET_XOR) + SALT_ADD
    b62 = base62_encode(mixed)
    return b62.rjust(MIN_LEN, ALPHABET[0])

def slugify(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9]+", "-", text.lower())
    return re.sub(r"-{2,}", "-", text).strip("-")

# ---------------- DB CONFIG ----------------
DB = {
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASS"),
    "database": os.getenv("DB_NAME"),
}

conn = mysql.connector.connect(**DB)
cur = conn.cursor(dictionary=True)

# ---------------- XML HELPERS ----------------
def write_sitemap(filename, urls, priority="0.8"):
    urlset = Element("urlset", {
        "xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9"
    })

    for u in urls:
        url = SubElement(urlset, "url")
        SubElement(url, "loc").text = u
        SubElement(url, "lastmod").text = TODAY
        SubElement(url, "changefreq").text = "weekly"
        SubElement(url, "priority").text = priority

    ElementTree(urlset).write(
        os.path.join(OUT_DIR, filename),
        encoding="utf-8",
        xml_declaration=True
    )

def write_sitemap_index(filename, sitemaps):
    index = Element("sitemapindex", {
        "xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9"
    })

    for sm in sitemaps:
        sitemap = SubElement(index, "sitemap")
        SubElement(sitemap, "loc").text = sm
        SubElement(sitemap, "lastmod").text = TODAY

    ElementTree(index).write(
        os.path.join(OUT_DIR, filename),
        encoding="utf-8",
        xml_declaration=True
    )

# =====================================================
# MAIN STATIC ROUTES
# =====================================================
main_urls = [
    f"{BASE_URL}/{LANG}",
    f"{BASE_URL}/{LANG}/tutorials",
    f"{BASE_URL}/{LANG}/algorithms",
    f"{BASE_URL}/{LANG}/interview-questions",
    f"{BASE_URL}/{LANG}/about",
    f"{BASE_URL}/{LANG}/privacy",
    f"{BASE_URL}/{LANG}/disclaimer",
    f"{BASE_URL}/{LANG}/contact",
    f"{BASE_URL}/{LANG}/terms",
]
write_sitemap("sitemap-main.xml", main_urls, priority="1.0")

# =====================================================
# TUTORIALS – CHAPTER BASED
# /en/tutorials/{library_slug}/{chapter_id}/path/advanced
# =====================================================
tutorial_chapter_urls = []

PATH_KEYS = ["7min", "30min", "2hrs", "advanced"]

cur.execute("""
SELECT DISTINCT
  lib.id   AS library_id,
  lib.slug AS library_slug
FROM chapters c
JOIN libraries lib ON lib.id = c.library_id
""")

for r in cur.fetchall():
    encoded_lib_id = encode_id(r["library_id"])

    for path_key in PATH_KEYS:
        tutorial_chapter_urls.append(
            f"{BASE_URL}/{LANG}/tutorials/{r['library_slug']}/{encoded_lib_id}/path/{path_key}"
        )

write_sitemap("sitemap-tutorials-chapters.xml", tutorial_chapter_urls)


# =====================================================
# TUTORIALS – LESSON DEEP PATH
# /en/tutorials/{library_slug}/{lesson_id}/path/advanced/core/refinement
# =====================================================
tutorial_lesson_urls = []

cur.execute("""
SELECT
  lib.id   AS library_id,
  lib.slug AS library_slug,
  c.slug   AS chapter_slug,
  l.slug   AS lesson_slug
FROM libraries lib
JOIN chapters c ON c.library_id = lib.id
JOIN lessons l  ON l.chapter_id = c.id
""")

for r in cur.fetchall():
    tutorial_lesson_urls.append(
        f"{BASE_URL}/{LANG}/tutorials/"
        f"{r['library_slug']}/"
        f"{encode_id(r['library_id'])}/"
        f"path/advanced/"
        f"{r['chapter_slug']}/"
        f"{r['lesson_slug']}"
    )

write_sitemap("sitemap-tutorials-lessons.xml", tutorial_lesson_urls)


# =====================================================
# ALGORITHMS – LESSON BASED
# /en/algorithms/{slug}/learn/{category}/{lesson_id}
# =====================================================
algo_urls = []

cur.execute("""
SELECT
  l.id   AS lesson_id,
  l.slug AS lesson_slug,
  CASE
    WHEN c.slug LIKE '%mathematics%' THEN 'mathematics'
    WHEN c.slug LIKE '%physics%' THEN 'physics'
    WHEN c.slug LIKE '%cs-it%' THEN 'computer%20science'
    ELSE NULL
  END AS category
FROM lessons l
JOIN chapters c ON c.id = l.chapter_id
WHERE c.library_id IN (217, 220)
""")

for r in cur.fetchall():
    if not r["category"]:
        continue  # safety

    algo_urls.append(
        f"{BASE_URL}/{LANG}/algorithms/"
        f"{r['lesson_slug']}/"
        f"learn/{r['category']}/"
        f"{encode_id(r['lesson_id'])}"
    )

write_sitemap("sitemap-algorithms.xml", algo_urls)



# =====================================================
# INTERVIEW QUESTIONS – INTERVIEW_QUESTION BASED
# /en/tutorials/{library_slug}/{interview_question_id}/interview-questions
# =====================================================
interview_urls = []

cur.execute("""
SELECT DISTINCT
  lib.id   AS library_id,
  lib.slug AS library_slug
FROM interview_questions iq
JOIN libraries lib ON lib.id = iq.library_id
""")

for r in cur.fetchall():
    interview_urls.append(
        f"{BASE_URL}/{LANG}/tutorials/{r['library_slug']}/{encode_id(r['library_id'])}/interview-questions"
    )

write_sitemap("sitemap-interview.xml", interview_urls)

# =====================================================
# ROOT SITEMAP INDEX
# =====================================================
write_sitemap_index(
    "sitemap.xml",
    [
        f"{BASE_URL}/sitemaps/sitemap-main.xml",
        f"{BASE_URL}/sitemaps/sitemap-tutorials-chapters.xml",
        f"{BASE_URL}/sitemaps/sitemap-tutorials-lessons.xml",
        f"{BASE_URL}/sitemaps/sitemap-algorithms.xml",
        f"{BASE_URL}/sitemaps/sitemap-interview.xml",
    ]
)

cur.close()
conn.close()

print("✅ All sitemaps generated successfully")
