#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Callable

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_API_URL = "http://127.0.0.1:5000/couponleo/api/categories?limit=250"
OUTPUT_DIR = ROOT / "public" / "assets" / "images" / "categories"
MANIFEST_PATH = ROOT / "src" / "app" / "services" / "couponleo-category-assets.generated.ts"
CANVAS_SIZE = 1254
TITLE_REGION_WIDTH = 980
TITLE_MAX_LINES = 2
BG_TEXT = "#12234f"
ACCENT_TEXT = "#4a6289"
PROTECTED_EXISTING_SLUGS = {
    "beauty",
    "electronics",
    "fashion",
    "health-fitness",
    "office-supplies",
    "sports",
}

ThemeKey = str
IconPainter = Callable[[ImageDraw.ImageDraw, tuple[int, int, int, int], str], None]


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/segoeuib.ttf") if bold else Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


TITLE_FONT = load_font(78, bold=True)
SUBTITLE_FONT = load_font(28)
BADGE_FONT = load_font(26, bold=True)
CHIP_FONT = load_font(28, bold=True)


THEMES: dict[ThemeKey, dict[str, object]] = {
    "auto": {
        "label": "Auto and tools",
        "palette": {
            "top": "#fff6f1",
            "bottom": "#f6fbff",
            "accent_a": "#ff9f5a",
            "accent_b": "#ffcf7d",
            "orb": "#17305f",
            "chip": "#ffffff",
        },
    },
    "beauty": {
        "label": "Beauty picks",
        "palette": {
            "top": "#fff3f8",
            "bottom": "#fffdfb",
            "accent_a": "#ff8cb8",
            "accent_b": "#ffbf8f",
            "orb": "#8b3a6d",
            "chip": "#ffffff",
        },
    },
    "books": {
        "label": "Books and learning",
        "palette": {
            "top": "#f4f6ff",
            "bottom": "#fcfdff",
            "accent_a": "#7ba3ff",
            "accent_b": "#9fd8ff",
            "orb": "#153062",
            "chip": "#ffffff",
        },
    },
    "business": {
        "label": "Business services",
        "palette": {
            "top": "#f5f8ff",
            "bottom": "#fffdfa",
            "accent_a": "#6f8eff",
            "accent_b": "#96c8ff",
            "orb": "#17305f",
            "chip": "#ffffff",
        },
    },
    "electronics": {
        "label": "Digital deals",
        "palette": {
            "top": "#f0f6ff",
            "bottom": "#fbfcff",
            "accent_a": "#5f8cff",
            "accent_b": "#6fc8ff",
            "orb": "#142e5d",
            "chip": "#ffffff",
        },
    },
    "entertainment": {
        "label": "Leisure picks",
        "palette": {
            "top": "#fff4f1",
            "bottom": "#fffdfc",
            "accent_a": "#ff9267",
            "accent_b": "#ffb8a0",
            "orb": "#18325f",
            "chip": "#ffffff",
        },
    },
    "fashion": {
        "label": "Style and apparel",
        "palette": {
            "top": "#fff5ef",
            "bottom": "#fffdf9",
            "accent_a": "#ff9b66",
            "accent_b": "#ffd089",
            "orb": "#182f5d",
            "chip": "#ffffff",
        },
    },
    "finance": {
        "label": "Protection and finance",
        "palette": {
            "top": "#f5f8ff",
            "bottom": "#fffdfb",
            "accent_a": "#7997ff",
            "accent_b": "#76d1d8",
            "orb": "#14305f",
            "chip": "#ffffff",
        },
    },
    "food": {
        "label": "Food and grocery",
        "palette": {
            "top": "#fff8ee",
            "bottom": "#fffdf9",
            "accent_a": "#ff9d58",
            "accent_b": "#ffc976",
            "orb": "#18305d",
            "chip": "#ffffff",
        },
    },
    "gifts": {
        "label": "Gift ideas",
        "palette": {
            "top": "#fff7f1",
            "bottom": "#fffefd",
            "accent_a": "#ff8d63",
            "accent_b": "#ffb877",
            "orb": "#19315f",
            "chip": "#ffffff",
        },
    },
    "health": {
        "label": "Wellness and care",
        "palette": {
            "top": "#f7f6ff",
            "bottom": "#fffefd",
            "accent_a": "#7d94ff",
            "accent_b": "#9ec6ff",
            "orb": "#173161",
            "chip": "#ffffff",
        },
    },
    "home": {
        "label": "Home essentials",
        "palette": {
            "top": "#f7f8ff",
            "bottom": "#fffdf9",
            "accent_a": "#8d95ff",
            "accent_b": "#a7d5ff",
            "orb": "#17315f",
            "chip": "#ffffff",
        },
    },
    "kids": {
        "label": "Family favorites",
        "palette": {
            "top": "#fff8f1",
            "bottom": "#fffefd",
            "accent_a": "#ffab66",
            "accent_b": "#ffc98f",
            "orb": "#18315f",
            "chip": "#ffffff",
        },
    },
    "office": {
        "label": "Office and work",
        "palette": {
            "top": "#f4f7ff",
            "bottom": "#fffefd",
            "accent_a": "#7591ff",
            "accent_b": "#a1c7ff",
            "orb": "#18315f",
            "chip": "#ffffff",
        },
    },
    "pets": {
        "label": "Pet essentials",
        "palette": {
            "top": "#fff7f2",
            "bottom": "#fffefd",
            "accent_a": "#ff9d68",
            "accent_b": "#ffc985",
            "orb": "#17315f",
            "chip": "#ffffff",
        },
    },
    "sports": {
        "label": "Sport and fitness",
        "palette": {
            "top": "#f5f7ff",
            "bottom": "#fffefc",
            "accent_a": "#6f8fff",
            "accent_b": "#9dd2ff",
            "orb": "#18305f",
            "chip": "#ffffff",
        },
    },
    "travel": {
        "label": "Travel and stays",
        "palette": {
            "top": "#f3f8ff",
            "bottom": "#fffefa",
            "accent_a": "#6f8fff",
            "accent_b": "#78d2ff",
            "orb": "#18305f",
            "chip": "#ffffff",
        },
    },
}

THEME_RULES: list[tuple[ThemeKey, tuple[str, ...]]] = [
    ("travel", ("travel", "flight", "airport", "hotel", "holiday", "villa", "homestay")),
    ("sports", ("sport", "fitness", "outdoor")),
    ("kids", ("baby", "child", "kids", "family", "maternity", "toy")),
    ("pets", ("pet",)),
    ("gifts", ("gift", "seasonal")),
    ("food", ("food", "grocery", "snack", "cake")),
    ("health", ("health", "medical", "nutrition", "groom", "body-care", "spa", "parlor", "personal-care")),
    ("beauty", ("beauty", "makeup")),
    ("auto", ("auto", "automobile", "firearm", "tactical", "industrial", "safety")),
    ("electronics", ("electronics", "computer", "laptop", "mobile", "smart", "software", "graphics", "hosting", "website", "online-service", "telco")),
    ("fashion", ("fashion", "clothing", "bag", "jewelry", "watch", "eyewear", "accessories", "luxury", "sportswear")),
    ("home", ("home", "furniture", "decor", "garden", "kitchen", "housekeeping", "building", "green-eco", "real-estate")),
    ("books", ("book", "education", "training", "self-help", "personal-development", "arts-and-crafts", "music", "hobbies")),
    ("entertainment", ("entertainment", "gaming", "event", "lifestyle", "leisure")),
    ("finance", ("insurance", "legal")),
    ("business", ("business", "b2b", "marketing", "advertising", "consultation", "employment", "job", "community", "organization", "buy-sell")),
    ("office", ("office", "printing", "department", "shopping", "other")),
]

STOPWORDS = {"and", "to", "the", "of", "for", "with", "or", "a", "an", "services"}


def hex_to_rgba(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def lerp(left: tuple[int, int, int, int], right: tuple[int, int, int, int], ratio: float) -> tuple[int, int, int, int]:
    return tuple(int(left[index] + ((right[index] - left[index]) * ratio)) for index in range(4))


def slugify(value: str) -> str:
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-") or "other"


def tokenize(value: str) -> set[str]:
    base_tokens = {token for token in re.split(r"[^a-z0-9]+", value.lower()) if token}
    singular_tokens = {
        token[:-1]
        for token in base_tokens
        if token.endswith("s") and len(token) > 3
    }
    return base_tokens | singular_tokens


def keyword_matches(tokens: set[str], keyword: str) -> bool:
    keyword_parts = {part for part in keyword.split("-") if part}
    return keyword_parts.issubset(tokens)


def resolve_theme(slug: str, name: str) -> ThemeKey:
    tokens = tokenize(f"{slug} {name}")
    for theme, keywords in THEME_RULES:
        if any(keyword_matches(tokens, keyword) for keyword in keywords):
            return theme
    return "business"


def draw_vertical_gradient(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size)
    top_color = hex_to_rgba(top)
    bottom_color = hex_to_rgba(bottom)
    pixels = image.load()
    for y in range(height):
        ratio = y / max(height - 1, 1)
        color = lerp(top_color, bottom_color, ratio)
        for x in range(width):
            pixels[x, y] = color
    return image


def apply_blurred_blob(image: Image.Image, bbox: tuple[int, int, int, int], fill: str, blur: int, alpha: int) -> None:
    blob_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    blob_draw = ImageDraw.Draw(blob_layer)
    blob_draw.ellipse(bbox, fill=hex_to_rgba(fill, alpha))
    blob_layer = blob_layer.filter(ImageFilter.GaussianBlur(blur))
    image.alpha_composite(blob_layer)


def draw_shadowed_round_rect(image: Image.Image, bbox: tuple[int, int, int, int], radius: int, fill: tuple[int, int, int, int]) -> None:
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (bbox[0] + 10, bbox[1] + 22, bbox[2] + 18, bbox[3] + 34),
        radius=radius,
        fill=(15, 33, 74, 26),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(34))
    image.alpha_composite(shadow)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(bbox, radius=radius, fill=fill)


def draw_gradient_tile(image: Image.Image, bbox: tuple[int, int, int, int], radius: int, color_a: str, color_b: str) -> None:
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    tile = draw_vertical_gradient((width, height), color_a, color_b)
    mask = Image.new("L", (width, height), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((0, 0, width, height), radius=radius, fill=255)
    tile.putalpha(mask)
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (bbox[0] + 10, bbox[1] + 18, bbox[2] + 12, bbox[3] + 22),
        radius=radius,
        fill=(22, 43, 80, 44),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    image.alpha_composite(shadow)
    image.alpha_composite(tile, dest=(bbox[0], bbox[1]))


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int, max_lines: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        tentative = f"{current} {word}".strip()
        if draw.textlength(tentative, font=font) <= max_width or not current:
            current = tentative
            continue
        lines.append(current)
        current = word
        if len(lines) == max_lines - 1:
            break
    remainder = words[len(" ".join(lines + ([current] if current else [])).split()):]
    final_line = current
    if remainder:
        final_line = f"{final_line} {' '.join(remainder)}".strip()
    if draw.textlength(final_line, font=font) > max_width:
        while final_line and draw.textlength(f"{final_line}\u2026", font=font) > max_width:
            final_line = final_line[:-1].rstrip()
        final_line = f"{final_line}\u2026"
    if final_line:
        lines.append(final_line)
    return lines[:max_lines]


def draw_pill(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill: tuple[int, int, int, int], font: ImageFont.ImageFont, text_fill: str = BG_TEXT) -> tuple[int, int, int, int]:
    left, top = xy
    text_box = draw.textbbox((0, 0), text, font=font)
    width = (text_box[2] - text_box[0]) + 36
    height = (text_box[3] - text_box[1]) + 22
    bbox = (left, top, left + width, top + height)
    draw.rounded_rectangle(bbox, radius=height // 2, fill=fill)
    draw.text((left + 18, top + 10), text, font=font, fill=text_fill)
    return bbox


def derive_chips(name: str, theme: ThemeKey) -> list[str]:
    words = [word for word in re.split(r"[^A-Za-z0-9]+", name) if word]
    keywords = [word.title() for word in words if word.lower() not in STOPWORDS]
    chips = keywords[:2]
    if not chips:
        chips = [str(THEMES[theme]["label"]).split()[0].title()]
    if len(chips) == 1:
        theme_word = str(THEMES[theme]["label"]).split()[-1].title()
        if theme_word not in chips:
            chips.append(theme_word)
    return chips[:2]


def normalized_box(box: tuple[int, int, int, int], x: float, y: float) -> tuple[int, int]:
    return (
        int(box[0] + ((box[2] - box[0]) * x)),
        int(box[1] + ((box[3] - box[1]) * y)),
    )


def draw_books_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 22)
    left_page = (*normalized_box(box, 0.2, 0.28), *normalized_box(box, 0.48, 0.76))
    right_page = (*normalized_box(box, 0.52, 0.28), *normalized_box(box, 0.8, 0.76))
    draw.rounded_rectangle(left_page, radius=22, outline=color, width=line)
    draw.rounded_rectangle(right_page, radius=22, outline=color, width=line)
    draw.line([normalized_box(box, 0.5, 0.24), normalized_box(box, 0.5, 0.8)], fill=color, width=line)


def draw_bag_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 22)
    bag = (*normalized_box(box, 0.22, 0.34), *normalized_box(box, 0.78, 0.8))
    draw.rounded_rectangle(bag, radius=28, outline=color, width=line)
    draw.arc(
        (*normalized_box(box, 0.34, 0.16), *normalized_box(box, 0.66, 0.46)),
        start=200,
        end=340,
        fill=color,
        width=line,
    )


def draw_beauty_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 22)
    bottle = (*normalized_box(box, 0.3, 0.28), *normalized_box(box, 0.7, 0.78))
    draw.rounded_rectangle(bottle, radius=34, outline=color, width=line)
    draw.rectangle((*normalized_box(box, 0.4, 0.18), *normalized_box(box, 0.6, 0.28)), outline=color, width=line)
    cx, cy = normalized_box(box, 0.74, 0.28)
    draw.line([(cx, cy - 18), (cx, cy + 18)], fill=color, width=line // 2)
    draw.line([(cx - 18, cy), (cx + 18, cy)], fill=color, width=line // 2)


def draw_device_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 22)
    monitor = (*normalized_box(box, 0.18, 0.24), *normalized_box(box, 0.82, 0.62))
    draw.rounded_rectangle(monitor, radius=30, outline=color, width=line)
    draw.line([normalized_box(box, 0.43, 0.72), normalized_box(box, 0.57, 0.72)], fill=color, width=line)
    draw.line([normalized_box(box, 0.5, 0.62), normalized_box(box, 0.5, 0.78)], fill=color, width=line)
    phone = (*normalized_box(box, 0.64, 0.3), *normalized_box(box, 0.82, 0.76))
    draw.rounded_rectangle(phone, radius=18, outline=color, width=line)


def draw_play_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 24)
    circle = (*normalized_box(box, 0.18, 0.22), *normalized_box(box, 0.7, 0.74))
    draw.ellipse(circle, outline=color, width=line)
    triangle = [normalized_box(box, 0.4, 0.36), normalized_box(box, 0.4, 0.6), normalized_box(box, 0.6, 0.48)]
    draw.polygon(triangle, outline=color, fill=None)
    draw.line([normalized_box(box, 0.76, 0.26), normalized_box(box, 0.76, 0.6)], fill=color, width=line)
    draw.arc((*normalized_box(box, 0.7, 0.18), *normalized_box(box, 0.9, 0.38)), start=0, end=180, fill=color, width=line)


def draw_shield_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 24)
    points = [
        normalized_box(box, 0.5, 0.18),
        normalized_box(box, 0.8, 0.28),
        normalized_box(box, 0.74, 0.68),
        normalized_box(box, 0.5, 0.84),
        normalized_box(box, 0.26, 0.68),
        normalized_box(box, 0.2, 0.28),
    ]
    draw.line(points + [points[0]], fill=color, width=line, joint="curve")
    draw.line([normalized_box(box, 0.38, 0.52), normalized_box(box, 0.48, 0.62), normalized_box(box, 0.66, 0.42)], fill=color, width=line)


def draw_food_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 24)
    draw.ellipse((*normalized_box(box, 0.28, 0.34), *normalized_box(box, 0.72, 0.78)), outline=color, width=line)
    draw.line([normalized_box(box, 0.18, 0.24), normalized_box(box, 0.18, 0.78)], fill=color, width=line)
    for offset in (0.12, 0.18, 0.24):
        draw.line([normalized_box(box, offset, 0.24), normalized_box(box, offset, 0.38)], fill=color, width=line // 2)
    draw.line([normalized_box(box, 0.84, 0.24), normalized_box(box, 0.74, 0.6)], fill=color, width=line)
    draw.line([normalized_box(box, 0.74, 0.6), normalized_box(box, 0.74, 0.78)], fill=color, width=line)


def draw_gift_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 24)
    box_rect = (*normalized_box(box, 0.2, 0.36), *normalized_box(box, 0.8, 0.8))
    lid_rect = (*normalized_box(box, 0.18, 0.26), *normalized_box(box, 0.82, 0.42))
    draw.rounded_rectangle(box_rect, radius=26, outline=color, width=line)
    draw.rounded_rectangle(lid_rect, radius=24, outline=color, width=line)
    draw.line([normalized_box(box, 0.5, 0.26), normalized_box(box, 0.5, 0.8)], fill=color, width=line)
    draw.line([normalized_box(box, 0.2, 0.5), normalized_box(box, 0.8, 0.5)], fill=color, width=line)
    draw.arc((*normalized_box(box, 0.36, 0.14), *normalized_box(box, 0.5, 0.34)), start=110, end=360, fill=color, width=line)
    draw.arc((*normalized_box(box, 0.5, 0.14), *normalized_box(box, 0.64, 0.34)), start=180, end=70, fill=color, width=line)


def draw_heart_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 24)
    left = normalized_box(box, 0.38, 0.32)
    right = normalized_box(box, 0.62, 0.32)
    bottom = normalized_box(box, 0.5, 0.76)
    draw.ellipse((*normalized_box(box, 0.24, 0.18), *normalized_box(box, 0.5, 0.48)), outline=color, width=line)
    draw.ellipse((*normalized_box(box, 0.5, 0.18), *normalized_box(box, 0.76, 0.48)), outline=color, width=line)
    draw.line([left, bottom, right], fill=color, width=line)


def draw_house_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 24)
    roof = [normalized_box(box, 0.2, 0.46), normalized_box(box, 0.5, 0.22), normalized_box(box, 0.8, 0.46)]
    draw.line(roof, fill=color, width=line, joint="curve")
    draw.rounded_rectangle((*normalized_box(box, 0.26, 0.44), *normalized_box(box, 0.74, 0.8)), radius=24, outline=color, width=line)
    draw.rounded_rectangle((*normalized_box(box, 0.44, 0.56), *normalized_box(box, 0.56, 0.8)), radius=16, outline=color, width=line)


def draw_blocks_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 24)
    draw.rounded_rectangle((*normalized_box(box, 0.22, 0.46), *normalized_box(box, 0.44, 0.72)), radius=18, outline=color, width=line)
    draw.rounded_rectangle((*normalized_box(box, 0.48, 0.34), *normalized_box(box, 0.72, 0.6)), radius=18, outline=color, width=line)
    draw.line([normalized_box(box, 0.32, 0.3), normalized_box(box, 0.32, 0.42)], fill=color, width=line // 2)
    draw.line([normalized_box(box, 0.26, 0.36), normalized_box(box, 0.38, 0.36)], fill=color, width=line // 2)


def draw_briefcase_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 24)
    case = (*normalized_box(box, 0.2, 0.34), *normalized_box(box, 0.8, 0.76))
    draw.rounded_rectangle(case, radius=26, outline=color, width=line)
    draw.line([normalized_box(box, 0.2, 0.52), normalized_box(box, 0.8, 0.52)], fill=color, width=line)
    draw.arc((*normalized_box(box, 0.36, 0.18), *normalized_box(box, 0.64, 0.4)), start=200, end=340, fill=color, width=line)
    for offset, height in ((0.3, 0.68), (0.44, 0.6), (0.58, 0.52)):
        draw.rounded_rectangle((*normalized_box(box, offset, height), *normalized_box(box, offset + 0.08, 0.78)), radius=12, fill=color)


def draw_paw_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    draw.ellipse((*normalized_box(box, 0.34, 0.42), *normalized_box(box, 0.66, 0.74)), outline=color, width=10)
    for x, y in ((0.28, 0.24), (0.44, 0.18), (0.56, 0.18), (0.72, 0.24)):
        draw.ellipse((*normalized_box(box, x - 0.07, y - 0.07), *normalized_box(box, x + 0.07, y + 0.07)), outline=color, width=10)


def draw_sport_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 24)
    draw.line([normalized_box(box, 0.2, 0.36), normalized_box(box, 0.8, 0.36)], fill=color, width=line)
    draw.line([normalized_box(box, 0.32, 0.24), normalized_box(box, 0.32, 0.48)], fill=color, width=line)
    draw.line([normalized_box(box, 0.68, 0.24), normalized_box(box, 0.68, 0.48)], fill=color, width=line)
    draw.ellipse((*normalized_box(box, 0.28, 0.5), *normalized_box(box, 0.72, 0.86)), outline=color, width=line)
    draw.arc((*normalized_box(box, 0.28, 0.5), *normalized_box(box, 0.72, 0.86)), start=0, end=180, fill=color, width=line)
    draw.arc((*normalized_box(box, 0.28, 0.5), *normalized_box(box, 0.72, 0.86)), start=90, end=270, fill=color, width=line)


def draw_travel_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 24)
    suitcase = (*normalized_box(box, 0.22, 0.32), *normalized_box(box, 0.54, 0.76))
    draw.rounded_rectangle(suitcase, radius=24, outline=color, width=line)
    draw.arc((*normalized_box(box, 0.3, 0.18), *normalized_box(box, 0.46, 0.38)), start=180, end=360, fill=color, width=line)
    plane = [
        normalized_box(box, 0.62, 0.42),
        normalized_box(box, 0.84, 0.34),
        normalized_box(box, 0.72, 0.48),
        normalized_box(box, 0.88, 0.6),
        normalized_box(box, 0.68, 0.56),
        normalized_box(box, 0.62, 0.72),
        normalized_box(box, 0.58, 0.56),
        normalized_box(box, 0.42, 0.6),
        normalized_box(box, 0.54, 0.48),
        normalized_box(box, 0.42, 0.34),
    ]
    draw.line(plane + [plane[0]], fill=color, width=line, joint="curve")


def draw_auto_icon(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    line = max(8, (box[2] - box[0]) // 24)
    draw.ellipse((*normalized_box(box, 0.26, 0.24), *normalized_box(box, 0.74, 0.72)), outline=color, width=line)
    draw.ellipse((*normalized_box(box, 0.42, 0.4), *normalized_box(box, 0.58, 0.56)), outline=color, width=line)
    for point in ((0.5, 0.24), (0.68, 0.32), (0.74, 0.48), (0.68, 0.64), (0.5, 0.72), (0.32, 0.64), (0.26, 0.48), (0.32, 0.32)):
        draw.line([normalized_box(box, 0.5, 0.48), normalized_box(box, *point)], fill=color, width=line // 2)


ICON_PAINTERS: dict[ThemeKey, IconPainter] = {
    "auto": draw_auto_icon,
    "beauty": draw_beauty_icon,
    "books": draw_books_icon,
    "business": draw_briefcase_icon,
    "electronics": draw_device_icon,
    "entertainment": draw_play_icon,
    "fashion": draw_bag_icon,
    "finance": draw_shield_icon,
    "food": draw_food_icon,
    "gifts": draw_gift_icon,
    "health": draw_heart_icon,
    "home": draw_house_icon,
    "kids": draw_blocks_icon,
    "office": draw_briefcase_icon,
    "pets": draw_paw_icon,
    "sports": draw_sport_icon,
    "travel": draw_travel_icon,
}


def render_category_image(name: str, theme: ThemeKey) -> Image.Image:
    palette = THEMES[theme]["palette"]
    assert isinstance(palette, dict)

    image = draw_vertical_gradient((CANVAS_SIZE, CANVAS_SIZE), str(palette["top"]), str(palette["bottom"]))
    apply_blurred_blob(image, (54, 70, 620, 540), str(palette["accent_a"]), blur=60, alpha=80)
    apply_blurred_blob(image, (700, 200, 1180, 760), str(palette["accent_b"]), blur=72, alpha=76)
    apply_blurred_blob(image, (740, 880, 1200, 1230), str(palette["accent_a"]), blur=88, alpha=38)

    draw_shadowed_round_rect(image, (56, 52, 1198, 1198), radius=120, fill=(255, 255, 255, 238))
    draw_gradient_tile(image, (176, 164, 952, 708), radius=96, color_a=str(palette["accent_a"]), color_b=str(palette["accent_b"]))

    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((844, 126, 1068, 214), radius=44, fill=(255, 255, 255, 212))
    badge_text = str(THEMES[theme]["label"]).title()
    badge_box = draw.textbbox((0, 0), badge_text, font=BADGE_FONT)
    draw.text((872, 152), badge_text, font=BADGE_FONT, fill=BG_TEXT)

    draw_pill(draw, (116, 108), "CouponLeo Category", fill=(255, 255, 255, 204), font=BADGE_FONT, text_fill=ACCENT_TEXT)

    orb_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    orb_draw = ImageDraw.Draw(orb_layer)
    orb_draw.ellipse((422, 228, 782, 588), fill=hex_to_rgba(str(palette["orb"]), 228))
    orb_layer = orb_layer.filter(ImageFilter.GaussianBlur(2))
    image.alpha_composite(orb_layer)

    detail_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    detail_draw = ImageDraw.Draw(detail_layer)
    detail_draw.rounded_rectangle((262, 238, 444, 420), radius=46, fill=(255, 255, 255, 90))
    detail_draw.rounded_rectangle((754, 424, 896, 566), radius=40, fill=(255, 255, 255, 70))
    detail_layer = detail_layer.filter(ImageFilter.GaussianBlur(4))
    image.alpha_composite(detail_layer)

    ICON_PAINTERS[theme](draw, (462, 268, 744, 550), "#fdfefe")

    chips = derive_chips(name, theme)
    chip_x = 140
    for chip in chips:
        bbox = draw_pill(draw, (chip_x, 758), chip, fill=(255, 255, 255, 232), font=CHIP_FONT, text_fill=ACCENT_TEXT)
        chip_x = bbox[2] + 20

    title_lines = wrap_lines(draw, name, TITLE_FONT, TITLE_REGION_WIDTH, TITLE_MAX_LINES)
    title_y = 858
    for line in title_lines:
        draw.text((138, title_y), line, font=TITLE_FONT, fill=BG_TEXT)
        title_box = draw.textbbox((138, title_y), line, font=TITLE_FONT)
        title_y = title_box[3] + 8

    draw.text((140, 1082), "Curated coupon deals and savings from CouponLeo", font=SUBTITLE_FONT, fill=ACCENT_TEXT)
    return image.convert("RGB")


def fetch_categories(api_url: str) -> list[dict[str, str]]:
    response = requests.get(api_url, timeout=30)
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data")
    if not isinstance(data, list):
        raise ValueError("Category API response did not include a data array.")
    categories: list[dict[str, str]] = []
    for item in data:
        slug = slugify(str(item.get("slug", "")).strip())
        name = str(item.get("name", "")).strip() or slug.replace("-", " ").title()
        if not slug:
            continue
        categories.append({"slug": slug, "name": name})
    return sorted(categories, key=lambda item: item["slug"])


def write_manifest(categories: list[dict[str, str]], manifest_path: Path) -> None:
    themes = sorted(THEMES.keys())
    manifest_lines = [
        "/* eslint-disable */",
        "// Generated by scripts/generate_category_assets.py",
        "",
        f"export type CouponleoGeneratedCategoryTheme = {' | '.join([repr(theme) for theme in themes])};",
        "",
        "export interface CouponleoGeneratedCategoryAsset {",
        "  name: string;",
        "  imageSrc: string;",
        "  imageAlt: string;",
        "  theme: CouponleoGeneratedCategoryTheme;",
        "}",
        "",
        "export const couponleoGeneratedCategoryAssets: Record<string, CouponleoGeneratedCategoryAsset> = {",
    ]
    for category in categories:
        slug = category["slug"]
        name = category["name"].replace("'", "\\'")
        theme = resolve_theme(slug, category["name"])
        manifest_lines.extend([
            f"  '{slug}': {{",
            f"    name: '{name}',",
            f"    imageSrc: '/assets/images/categories/{slug}.png',",
            f"    imageAlt: '{name} category illustration',",
            f"    theme: '{theme}',",
            "  },",
        ])
    manifest_lines.extend([
        "};",
        "",
    ])
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text("\n".join(manifest_lines), encoding="utf-8")


def generate_assets(categories: list[dict[str, str]], output_dir: Path, overwrite: bool) -> tuple[int, int]:
    output_dir.mkdir(parents=True, exist_ok=True)
    created = 0
    skipped = 0
    for category in categories:
        slug = category["slug"]
        target = output_dir / f"{slug}.png"
        if target.exists() and slug in PROTECTED_EXISTING_SLUGS:
            skipped += 1
            continue
        if target.exists() and not overwrite:
            skipped += 1
            continue
        theme = resolve_theme(slug, category["name"])
        image = render_category_image(category["name"], theme)
        image.save(target, format="PNG", optimize=True, compress_level=9)
        created += 1
    return created, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate CouponLeo category images from the live local API.")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="Local CouponLeo category API URL.")
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR), help="Directory for category PNG files.")
    parser.add_argument("--manifest-path", default=str(MANIFEST_PATH), help="Generated TypeScript manifest path.")
    parser.add_argument("--overwrite", action="store_true", help="Regenerate existing exact-slug assets.")
    args = parser.parse_args()

    categories = fetch_categories(args.api_url)
    output_dir = Path(args.output_dir)
    manifest_path = Path(args.manifest_path)

    created, skipped = generate_assets(categories, output_dir, args.overwrite)
    write_manifest(categories, manifest_path)

    summary = {
        "api_url": args.api_url,
        "categories": len(categories),
        "created": created,
        "skipped": skipped,
        "output_dir": str(output_dir),
        "manifest_path": str(manifest_path),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
