import os
import json
import mysql.connector
from datetime import datetime
from openai import OpenAI
from dotenv import load_dotenv
# -------------------- ENV --------------------
load_dotenv()
# -------------------------
# OpenAI Client
# -------------------------
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# -------------------------
# MySQL Configuration
# -------------------------
DB_CFG = dict(
    host=os.getenv("DB_HOST", "127.0.0.1"),
    port=int(os.getenv("DB_PORT", "3306")),
    user=os.getenv("DB_USER", "root"),
    password=os.getenv("DB_PASS", ""),
    database=os.getenv("DB_NAME", "doc_tutorizer"),
    use_pure=True,
    connection_timeout=10,
)

# -------------------------
# Authority Tier Mapping
# -------------------------
TIER_SCORE = {1: 100, 2: 70, 3: 40}


def classify_store_with_gpt(store_name, url):

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "system",
                "content": "You are a classifier. Output JSON only."
            },
            {
                "role": "user",
                "content": f"""
Classify this online store.

Store name: {store_name}
Website: {url}

Rules:
- Tier 1 = global brand
- Tier 2 = known regional brand
- Tier 3 = small or niche brand

Return STRICT JSON ONLY:
{{
  "authority_tier": 1,
  "category": "electronics | fashion | food | travel | general"
}}
"""
            }
        ],
        temperature=0,
        response_format={"type": "json_object"}
    )

    raw = response.choices[0].message.content
    return safe_json_parse(raw)

def safe_json_parse(raw):
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}

def seed_initial_ranking():
    conn = mysql.connector.connect(**DB_CFG)
    cur = conn.cursor(dictionary=True)

    cur.execute("""
        SELECT id, name, url
        FROM stores
        WHERE initial_rank_score = 0
    """)
    stores = cur.fetchall()

    for store in stores:
        try:
            gpt_data = classify_store_with_gpt(store["name"], store["url"])
            tier = int(gpt_data.get("authority_tier", 3))
            category = gpt_data.get("category", "general")

            base_score = TIER_SCORE.get(tier, 40)
            category_bonus = 10 if category != "general" else 0

            initial_score = base_score + category_bonus

            cur.execute("""
                UPDATE stores
                SET authority_tier=%s,
                    category_hint=%s,
                    initial_rank_score=%s,
                    ranking_source='ai_seed',
                    rank_seeded_at=%s
                WHERE id=%s
            """, (
                tier,
                category,
                initial_score,
                datetime.utcnow(),
                store["id"]
            ))

            conn.commit()
            print(f"Seeded: {store['name']} → {initial_score}")

        except Exception as e:
            print(f"Error processing {store['name']}: {e}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    seed_initial_ranking()
