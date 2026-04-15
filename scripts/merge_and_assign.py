"""
merge_and_assign.py
raw_shapes.json + labeled_elements.json + audio_timing.json をマージし、
アニメーションを自動割り当てして slides.json を生成する。
"""

import sys
import os
import json
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from constants import OUTPUT_WIDTH, OUTPUT_HEIGHT

# ─── アニメーションルール ───

ANIMATION_RULES = {
    # 背景層: アニメーションなし
    "BG_FILL": None,
    "HEADER_STRIPE": None,
    "FOOTER_STRIPE": None,
    "TITLE_LINE": None,
    "BOTTOM_BAR": None,
    "LIST_DIVIDER": None,
    "CONTENT_AREA_BG": None,
    "ACCENT_SHAPE": None,

    # コンテンツ層
    "COVER_TITLE":     {"type": "fadeIn",        "delay": 0.0,  "duration": 0.6},
    "SLIDE_TITLE":     {"type": "fadeIn",        "delay": 0.0,  "duration": 0.4},
    "BODY_PARAGRAPH":  {"type": "fadeIn",        "delay": 1.0,  "duration": 0.6},
    "LIST_NUMBER":     {"type": "scaleIn",       "delay": None, "duration": 0.3},
    "LIST_HEADING":    {"type": "slideInLeft",   "delay": None, "duration": 0.4},
    "LIST_BODY":       {"type": "fadeIn",        "delay": None, "duration": 0.4},
    "SOURCE_CITATION": {"type": "fadeIn",        "delay": None, "duration": 0.3},
    "BOTTOM_TAKEAWAY": {"type": "slideInBottom", "delay": None, "duration": 0.5},
    "PAGE_NUMBER":     {"type": "fadeIn",        "delay": 0.0,  "duration": 0.2},

    # ビジュアル層
    "CONTENT_ICON":         {"type": "scaleIn", "delay": None, "duration": 0.4},
    "BOTTOM_TAKEAWAY_ICON": {"type": "scaleIn", "delay": None, "duration": 0.3},
    "LOGO":                 {"type": "fadeIn",  "delay": 1.0,  "duration": 0.5},
    "CHART_IMAGE":          {"type": "fadeIn",  "delay": None, "duration": 0.5},
}


# ─── ラベル自動判定（フォールバック） ───

def assign_label_by_position(shape, oh=OUTPUT_HEIGHT, ow=OUTPUT_WIDTH):
    """位置ベースでラベルを割り当てる（テキストなしシェイプ用）"""
    top_pct = shape["y"] / oh * 100 if oh > 0 else 0
    left_pct = shape["x"] / ow * 100 if ow > 0 else 0
    w_pct = shape["w"] / ow * 100 if ow > 0 else 0
    h_pct = shape["h"] / oh * 100 if oh > 0 else 0

    if w_pct > 95 and h_pct > 95:
        return "BG_FILL"
    if top_pct < 1 and h_pct < 6 and w_pct > 90:
        return "HEADER_STRIPE"
    if top_pct > 93 and h_pct < 6 and w_pct > 90:
        return "FOOTER_STRIPE"
    if h_pct < 1.5 and 14 < top_pct < 22 and w_pct > 50:
        return "TITLE_LINE"
    if 75 < top_pct < 85 and h_pct > 5 and h_pct < 15 and w_pct > 70:
        if shape.get("fill_color") is not None:
            return "BOTTOM_BAR"
    if h_pct < 1.5 and 20 < top_pct < 80 and w_pct > 50:
        return "LIST_DIVIDER"
    if 15 < top_pct < 30 and h_pct > 30 and w_pct > 30:
        if shape.get("fill_color") is not None:
            return "CONTENT_AREA_BG"
    return "ACCENT_SHAPE"


def assign_label_by_text_and_position(shape, oh, ow, slide_has_list, slide_type="paragraph"):
    """テキストありシェイプのフォールバックラベル付与"""
    text = (shape.get("text") or "").strip()
    top_pct = shape["y"] / oh * 100 if oh > 0 else 0
    w_pct = shape["w"] / ow * 100 if ow > 0 else 0
    h_pct = shape["h"] / oh * 100 if oh > 0 else 0

    if "/" in text and top_pct > 88 and len(text) < 10:
        return "PAGE_NUMBER"
    # カバースライドのタイトル（中央配置で大きい）
    if slide_type == "cover" and w_pct > 40 and h_pct > 15 and len(text) > 3:
        return "COVER_TITLE"
    if top_pct < 18 and w_pct > 45:
        return "SLIDE_TITLE"
    if "出典" in text or "参考" in text or "引用" in text:
        return "SOURCE_CITATION"
    if text.isdigit() and len(text) == 1:
        return "LIST_NUMBER"
    if 75 < top_pct < 85 and w_pct > 50:
        return "BOTTOM_TAKEAWAY"
    if slide_has_list and 20 < top_pct < 80:
        runs = shape.get("text_runs") or [{"font_size_pt": 0}]
        max_font_size = max((r.get("font_size_pt") or 0) for r in runs)
        text_length = len(text)
        if text_length < 20 and max_font_size >= 14:
            return "LIST_HEADING"
        else:
            return "LIST_BODY"
    return "BODY_PARAGRAPH"


# ─── マッチング ───

def match_shape_to_label(shape, labeled_elements):
    """shapeに対応するlabeled_elementを見つける"""
    if not shape.get("has_text") or not shape.get("text"):
        return None

    shape_text = shape["text"].strip()

    for el in labeled_elements:
        if el.get("text") is None:
            continue
        el_text = el["text"].strip()

        # 完全一致
        if shape_text == el_text:
            return el

        # 部分一致（shapeのテキストがelのテキストを含む、または逆）
        if shape_text in el_text or el_text in shape_text:
            return el

        # 先頭20文字一致
        if len(shape_text) > 20 and len(el_text) > 20:
            if shape_text[:20] == el_text[:20]:
                return el

    return None


# ─── delay動的計算 ───

def find_nearest_text_element(icon_el, all_elements):
    """アイコンに最も近いテキスト要素を探す"""
    icon_cx = icon_el["x"] + icon_el["w"] / 2
    icon_cy = icon_el["y"] + icon_el["h"] / 2

    candidates = [
        e for e in all_elements
        if e.get("label") in ("BODY_PARAGRAPH", "LIST_HEADING", "LIST_BODY", "SLIDE_TITLE")
        and e.get("animation")
    ]
    if not candidates:
        return None

    def dist(e):
        cx = e["x"] + e["w"] / 2
        cy = e["y"] + e["h"] / 2
        return math.sqrt((cx - icon_cx)**2 + (cy - icon_cy)**2)

    return min(candidates, key=dist)


def find_element_above(target, all_elements, text_only=False):
    """target要素の直上にあるテキスト要素を探す"""
    candidates = [
        e for e in all_elements
        if e["y"] + e["h"] < target["y"]
        and e.get("animation")
        and e["animation"].get("delay") is not None
    ]
    if text_only:
        candidates = [e for e in candidates if e.get("text")]
    if not candidates:
        return None
    return max(candidates, key=lambda e: e["y"])


def calculate_delays(elements, slide_type, slide_duration):
    """各要素のdelayを動的に計算する"""

    if slide_type == "list":
        list_items = [e for e in elements if e.get("label") == "LIST_NUMBER"]

        # 横並び検出: y座標が近い項目が多い場合はx座標でソート
        if len(list_items) >= 2:
            y_values = [e["y"] for e in list_items]
            y_range = max(y_values) - min(y_values)
            if y_range < 100:
                # 横並びレイアウト → x座標順
                list_items.sort(key=lambda e: e["x"])
            else:
                # 縦並びレイアウト → y座標順
                list_items.sort(key=lambda e: (e["y"], e["x"]))

        BASE_DELAY = 1.0
        STAGGER_INTERVAL = 1.2

        for i, item in enumerate(list_items):
            item_delay = BASE_DELAY + i * STAGGER_INTERVAL
            if item.get("animation"):
                item["animation"]["delay"] = item_delay

        # 各HEADING/BODYを最寄りのLIST_NUMBERに割り当て（上または左にあるもの優先）
        for e in elements:
            if e.get("label") not in ("LIST_HEADING", "LIST_BODY"):
                continue
            if not e.get("animation"):
                continue

            # 候補: eより上（または同じ高さ）にあるLIST_NUMBERから最も近いもの
            best = None
            best_dist = float("inf")
            for item in list_items:
                # 縦並び: numberのyがeのy以下 / 横並び: numberのxがeのx以下
                if item["y"] <= e["y"] + 50 and item["x"] <= e["x"] + 50:
                    dist = ((e["x"] - item["x"])**2 + (e["y"] - item["y"])**2) ** 0.5
                    if dist < best_dist:
                        best_dist = dist
                        best = item
            if best is None:
                # フォールバック: 最も近いものを使う
                for item in list_items:
                    dist = ((e["x"] - item["x"])**2 + (e["y"] - item["y"])**2) ** 0.5
                    if dist < best_dist:
                        best_dist = dist
                        best = item

            if best and best.get("animation"):
                if e["label"] == "LIST_HEADING":
                    e["animation"]["delay"] = best["animation"]["delay"]
                elif e["label"] == "LIST_BODY":
                    e["animation"]["delay"] = best["animation"]["delay"] + 0.3

    # CONTENT_ICON: 最も近いテキスト要素と同時
    for e in elements:
        if e.get("label") == "CONTENT_ICON" and e.get("animation"):
            nearest = find_nearest_text_element(e, elements)
            if nearest and nearest.get("animation") and nearest["animation"].get("delay") is not None:
                e["animation"]["delay"] = nearest["animation"]["delay"]
            else:
                e["animation"]["delay"] = 0.5

    # SOURCE_CITATION: 直前のテキスト要素 + 0.5s
    for e in elements:
        if e.get("label") == "SOURCE_CITATION" and e.get("animation"):
            prev = find_element_above(e, elements, text_only=True)
            if prev and prev.get("animation") and prev["animation"].get("delay") is not None:
                e["animation"]["delay"] = prev["animation"]["delay"] + prev["animation"].get("duration", 0.4) + 0.5
            else:
                e["animation"]["delay"] = 3.0

    # BOTTOM_TAKEAWAY: 文字数から必要な読み時間を逆算（日本語4文字/秒 + 余白1秒）
    for e in elements:
        if e.get("label") == "BOTTOM_TAKEAWAY" and e.get("animation"):
            text = e.get("text", "")
            read_time = len(text) / 4.0 + 1.0  # 読む時間 + 余白
            delay = slide_duration - read_time
            e["animation"]["delay"] = max(3.0, delay)

    # BOTTOM_TAKEAWAY_ICON: BOTTOM_TAKEAWAYと同時
    takeaway_delay = next(
        (e["animation"]["delay"] for e in elements
         if e.get("label") == "BOTTOM_TAKEAWAY" and e.get("animation")),
        max(3.0, slide_duration - 2.0)
    )
    for e in elements:
        if e.get("label") == "BOTTOM_TAKEAWAY_ICON" and e.get("animation"):
            e["animation"]["delay"] = takeaway_delay

    # CHART_IMAGE: BODY_PARAGRAPHの+0.3s
    for e in elements:
        if e.get("label") == "CHART_IMAGE" and e.get("animation"):
            body = next((el for el in elements if el.get("label") == "BODY_PARAGRAPH"
                         and el.get("animation")), None)
            if body and body["animation"].get("delay") is not None:
                e["animation"]["delay"] = body["animation"]["delay"] + 0.3
            else:
                e["animation"]["delay"] = 1.5

    # Noneが残っている要素にデフォルト値を設定
    for e in elements:
        if e.get("animation") and e["animation"].get("delay") is None:
            e["animation"]["delay"] = 1.0

    return elements


# ─── slide_duration決定 ───

def get_slide_duration(slide_index, audio_timing, elements, slide_type):
    """スライドの表示時間を決定する"""
    if audio_timing and "slides" in audio_timing:
        audio_entry = next(
            (s for s in audio_timing["slides"] if s["slide_index"] == slide_index),
            None
        )
        if audio_entry:
            return audio_entry["duration_sec"]

    return calculate_slide_duration_fallback(elements, slide_type)


def calculate_slide_duration_fallback(elements, slide_type):
    """音声データがない場合のフォールバック計算"""
    if slide_type == "cover":
        return 5.0
    if slide_type == "end":
        return 4.0
    if slide_type == "list":
        list_count = len([e for e in elements if e.get("label") == "LIST_NUMBER"])
        return 3.0 + list_count * 1.5 + 2.0
    if slide_type == "paragraph":
        total_chars = sum(len(e.get("text", "") or "") for e in elements if e.get("text"))
        return max(6.0, 3.0 + total_chars / 100 * 2.0 + 2.0)
    return 8.0


# ─── 要素の出力形式変換 ───

def shape_to_element(shape, label, slide_index, el_index, labeled_el=None):
    """shapeデータをslides.json用のelement形式に変換する"""
    animation_rule = ANIMATION_RULES.get(label)
    if animation_rule is None:
        return None  # 背景層はelementに含めない

    # タイプ判定
    if shape["is_picture"]:
        if shape["image_content_type"] == "external":
            el_type = "icon"
        else:
            el_type = "icon"
    elif shape.get("text_runs") and len(shape["text_runs"]) > 2:
        # 複数runがあり、色やboldが異なるならrichText
        colors = set()
        bolds = set()
        for r in shape["text_runs"]:
            if r["text"] == "\n":
                continue
            if r.get("font_color"):
                colors.add(r["font_color"])
            bolds.add(r.get("bold", False))
        if len(colors) > 1 or len(bolds) > 1:
            el_type = "richText"
        else:
            el_type = "text"
    else:
        el_type = "text"

    element = {
        "id": f"s{slide_index+1:02d}_el_{el_index+1:02d}",
        "label": label,
        "type": el_type,
        "x": shape["x"],
        "y": shape["y"],
        "w": shape["w"],
        "h": shape["h"],
        "animation": {
            "type": animation_rule["type"],
            "delay": animation_rule["delay"],
            "duration": animation_rule["duration"],
        }
    }

    if shape.get("has_text") and shape.get("text"):
        element["text"] = shape["text"]

    # フォントスタイル
    if shape.get("text_runs"):
        runs = [r for r in shape["text_runs"] if r["text"] != "\n"]
        if runs:
            sizes = [r["font_size_pt"] for r in runs if r["font_size_pt"]]
            element["fontSize"] = max(sizes) if sizes else 16

            colors = [r["font_color"] for r in runs if r["font_color"]]
            element["fontColor"] = colors[0] if colors else "#333333"

            bolds = [r["bold"] for r in runs]
            element["fontWeight"] = "bold" if any(bolds) else "normal"

            element["lineHeight"] = 1.5

    # richText spans
    if el_type == "richText" and shape.get("text_runs"):
        spans = []
        for r in shape["text_runs"]:
            span = {"text": r["text"]}
            if r.get("font_color"):
                span["color"] = r["font_color"]
            if r.get("bold"):
                span["bold"] = True
            spans.append(span)
        element["spans"] = spans

    # アイコン
    if shape["is_picture"]:
        element["type"] = "icon"
        icon_filename = shape.get("image_filename")
        if icon_filename:
            element["iconSrc"] = f"icons/{icon_filename}"
        # テキストは不要
        element.pop("text", None)
        element.pop("fontSize", None)
        element.pop("fontColor", None)
        element.pop("fontWeight", None)
        element.pop("lineHeight", None)
        element.pop("spans", None)

    return element


# ─── メイン処理 ───

def main(data_dir="data", assets_dir="assets"):
    raw_path = os.path.join(data_dir, "raw_shapes.json")
    labeled_path = os.path.join(data_dir, "labeled_elements.json")
    audio_path = os.path.join(data_dir, "audio_timing.json")

    if not os.path.exists(raw_path):
        print("[ERROR] raw_shapes.json が見つかりません", file=sys.stderr)
        sys.exit(1)

    with open(raw_path, encoding="utf-8") as f:
        raw_data = json.load(f)

    # labeled_elements.json（なくてもフォールバックで進む）
    labeled_data = []
    if os.path.exists(labeled_path):
        with open(labeled_path, encoding="utf-8") as f:
            labeled_data = json.load(f)
        print(f"ラベルデータ読み込み: {len(labeled_data)} スライド分")
    else:
        print("[WARN] labeled_elements.json が見つかりません。ルールベースでラベリングします。")

    # audio_timing.json（なくてもフォールバックで進む）
    audio_timing = None
    if os.path.exists(audio_path):
        with open(audio_path, encoding="utf-8") as f:
            audio_timing = json.load(f)
        print(f"音声タイミング読み込み: {len(audio_timing.get('slides', []))} スライド分")
    else:
        print("[WARN] audio_timing.json が見つかりません。フォールバックdurationを使用します。")

    slides_output = []

    for raw_slide in raw_data["slides"]:
        si = raw_slide["slide_index"]
        shapes = raw_slide["shapes"]

        # 対応するlabeled_dataを探す
        labeled_slide = next(
            (ld for ld in labeled_data if ld.get("slide_index") == si), None
        )
        labeled_elements = labeled_slide.get("elements", []) if labeled_slide else []
        slide_type = labeled_slide.get("slide_type", "paragraph") if labeled_slide else None

        # slide_typeが未判定の場合、ルールベースで推定
        if not slide_type:
            has_digit_shapes = any(
                (s.get("text") or "").strip().isdigit() and len((s.get("text") or "").strip()) == 1
                for s in shapes if s.get("has_text")
            )
            has_only_images = all(s["is_picture"] for s in shapes)
            if has_only_images or len(shapes) <= 1:
                slide_type = "end"
            elif si == 0:
                slide_type = "cover"
            elif has_digit_shapes:
                slide_type = "list"
            else:
                slide_type = "paragraph"

        slide_has_list = slide_type == "list"

        # 各シェイプにラベルを付与
        labeled_shapes = []
        for shape in shapes:
            label = None

            # 1. Vision APIのラベルとマッチング
            if shape.get("has_text") and shape.get("text"):
                matched = match_shape_to_label(shape, labeled_elements)
                if matched:
                    label = matched["label"]

            # 2. 画像シェイプ
            if label is None and shape["is_picture"]:
                name = shape["name"]
                top_pct = shape["y"] / OUTPUT_HEIGHT * 100

                # ストライプ画像
                if top_pct < 5 or top_pct > 95:
                    label = "HEADER_STRIPE" if top_pct < 5 else "FOOTER_STRIPE"
                # まとめバー内アイコン
                elif 75 < top_pct < 90 and shape["w"] < 80:
                    label = "BOTTOM_TAKEAWAY_ICON"
                # ロゴ（スライド1のペンギン等）
                elif si == 0 and top_pct > 70:
                    label = "LOGO"
                else:
                    label = "CONTENT_ICON"

            # 3. テキストなしシェイプ
            if label is None and not shape.get("has_text"):
                label = assign_label_by_position(shape)

            # 4. テキストありシェイプのフォールバック
            if label is None and shape.get("has_text"):
                label = assign_label_by_text_and_position(shape, OUTPUT_HEIGHT, OUTPUT_WIDTH, slide_has_list, slide_type)

            if label is None:
                label = "ACCENT_SHAPE"

            labeled_shapes.append((shape, label))

        # elementに変換（背景層は除外）
        elements = []
        el_idx = 0
        for shape, label in labeled_shapes:
            el = shape_to_element(shape, label, si, el_idx)
            if el:
                elements.append(el)
                el_idx += 1

        # durationを決定
        duration = get_slide_duration(si, audio_timing, elements, slide_type)

        # delayを動的計算
        elements = calculate_delays(elements, slide_type, duration)

        # BOTTOM_TAKEAWAY テキストの位置をアイコン分ずらす
        takeaway_icon = next((e for e in elements if e.get("label") == "BOTTOM_TAKEAWAY_ICON"), None)
        if takeaway_icon:
            icon_right = takeaway_icon["x"] + takeaway_icon["w"] + 10  # アイコン右端 + 余白
            for e in elements:
                if e.get("label") == "BOTTOM_TAKEAWAY" and e.get("text"):
                    if e["x"] < icon_right:
                        old_x = e["x"]
                        e["x"] = icon_right
                        e["w"] = e["w"] - (icon_right - old_x)

        # 音声情報
        audio_info = None
        if audio_timing and "slides" in audio_timing:
            ae = next((s for s in audio_timing["slides"] if s["slide_index"] == si), None)
            if ae:
                audio_info = {
                    "src": f"audio/{ae['audio_file']}",
                    "duration_sec": ae["duration_sec"],
                    "offset_sec": 0
                }

        slides_output.append({
            "slide_index": si,
            "slide_type": slide_type,
            "duration": round(duration, 2),
            "background": {
                "src": f"slides/slide_{si+1:02d}_bg.png"
            },
            "audio": audio_info,
            "elements": elements
        })

        print(f"  Slide {si+1}: type={slide_type}, duration={duration:.1f}s, elements={len(elements)}")

    # 最終JSON出力
    output = {
        "meta": {
            "source_file": raw_data["source_file"],
            "total_slides": len(slides_output),
            "output_width": OUTPUT_WIDTH,
            "output_height": OUTPUT_HEIGHT,
            "fps": 30
        },
        "slides": slides_output
    }

    output_path = os.path.join(data_dir, "slides.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    total_elements = sum(len(s["elements"]) for s in slides_output)
    total_duration = sum(s["duration"] for s in slides_output)
    print(f"\n完了: {len(slides_output)} スライド, {total_elements} 要素, 合計 {total_duration:.1f}秒")
    print(f"出力: {output_path}")


if __name__ == "__main__":
    main()
