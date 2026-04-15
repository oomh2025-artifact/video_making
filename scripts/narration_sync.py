"""
narration_sync.py
ナレーション原稿と音声タイミングデータを使って、
各スライド要素の出現タイミングを自動計算する。

Claude APIで原稿内のキーワードと要素をマッチングし、
文字位置の比率 × 音声長で出現時刻を決定する。
"""

import sys
import os
import json
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def parse_narration(narration_text):
    """ナレーション原稿をスライドごとに分割する（3行改行区切り）"""
    # 3つ以上の連続改行でスライドを分割
    slides = re.split(r'\n\s*\n\s*\n', narration_text.strip())
    result = []
    for slide_text in slides:
        lines = [l.strip() for l in slide_text.strip().split('\n') if l.strip()]
        full_text = ''.join(lines)
        result.append({
            "lines": lines,
            "full_text": full_text,
            "char_count": len(full_text),
        })
    return result


def find_keyword_position(narration_text, keyword):
    """ナレーション内でキーワードが最初に出現する文字位置（比率0-1）を返す"""
    if not keyword or not narration_text:
        return None

    # 完全一致
    pos = narration_text.find(keyword)
    if pos >= 0:
        return pos / len(narration_text)

    # 部分一致（キーワードの先頭10文字）
    short = keyword[:10]
    pos = narration_text.find(short)
    if pos >= 0:
        return pos / len(narration_text)

    # キーワードに含まれる主要な単語で検索
    for word_len in range(min(6, len(keyword)), 2, -1):
        for start in range(len(keyword) - word_len + 1):
            word = keyword[start:start + word_len]
            pos = narration_text.find(word)
            if pos >= 0:
                return pos / len(narration_text)

    return None


def sync_with_api(narration_slide, elements, client):
    """Claude APIで要素とナレーションのマッチングを行う"""
    element_list = []
    for el in elements:
        text = el.get("text", "")
        if text:
            element_list.append({"id": el["id"], "label": el["label"], "text": text[:50]})

    if not element_list:
        return {}

    prompt = f"""以下のナレーション原稿と、スライド要素の対応関係を分析してください。

## ナレーション原稿
{chr(10).join(narration_slide['lines'])}

## スライド要素
{json.dumps(element_list, ensure_ascii=False, indent=2)}

## タスク
各要素について、ナレーション原稿の中でその要素の内容に初めて言及している箇所を特定し、
その箇所が原稿全体の何%の位置にあるかを返してください。

JSONのみ出力してください:
[
    {{"id": "要素ID", "position_pct": 25.0, "matched_text": "マッチした原稿のフレーズ"}}
]
"""

    try:
        import anthropic
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )
        result_text = response.content[0].text.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("\n", 1)[1].rsplit("```", 1)[0]
        matches = json.loads(result_text)
        return {m["id"]: m["position_pct"] / 100.0 for m in matches}
    except Exception as e:
        print(f"    [WARN] API sync failed: {e}")
        return {}


def sync_slide_elements(elements, narration_slide, audio_duration, use_api=False, client=None):
    """1スライド分の要素タイミングを計算する"""
    narr_text = narration_slide["full_text"]

    # APIマッチング結果（使う場合）
    api_positions = {}
    if use_api and client:
        api_positions = sync_with_api(narration_slide, elements, client)

    # 前後の余白を除いた音声の有効範囲
    audio_start = 0.75  # 前パディング
    audio_end = audio_duration - 0.75  # 後パディング
    effective_duration = audio_end - audio_start

    for el in elements:
        if not el.get("animation"):
            continue

        label = el.get("label", "")

        # 背景層・ページ番号はそのまま
        if label in ("PAGE_NUMBER",):
            continue

        # SLIDE_TITLE: 最初から表示
        if label in ("SLIDE_TITLE", "COVER_TITLE"):
            el["animation"]["delay"] = 0.0
            continue

        # BOTTOM_TAKEAWAY: 既存ロジック維持（文字数ベース）
        if label in ("BOTTOM_TAKEAWAY", "BOTTOM_TAKEAWAY_ICON"):
            continue

        # APIマッチングがある場合
        if el["id"] in api_positions:
            pos = api_positions[el["id"]]
            el["animation"]["delay"] = round(audio_start + pos * effective_duration, 2)
            el["_narr_matched"] = True
            continue

        # ローカルマッチング: 要素テキストをナレーション内で検索
        el_text = el.get("text", "")
        if el_text and label not in ("LOGO",):
            position = find_keyword_position(narr_text, el_text.replace("\n", ""))
            if position is not None:
                delay = audio_start + position * effective_duration
                # アニメーション開始は言及の0.5秒前
                delay = max(0.5, delay - 0.5)
                el["animation"]["delay"] = round(delay, 2)
                el["_narr_matched"] = True
                continue

        # アイコン: 最寄りテキスト要素と同時（既存ロジック維持）

    # 後処理: リスト項目をグループ化し、視覚順序を保証する
    list_numbers = [e for e in elements if e.get("label") == "LIST_NUMBER" and e.get("animation")]
    list_headings = [e for e in elements if e.get("label") == "LIST_HEADING" and e.get("animation")]
    list_bodies = [e for e in elements if e.get("label") == "LIST_BODY" and e.get("animation")]

    if list_numbers:
        # 視覚順にソート
        y_values = [e["y"] for e in list_numbers]
        y_range = max(y_values) - min(y_values) if len(y_values) > 1 else 0
        if y_range < 100:
            list_numbers.sort(key=lambda e: e["x"])
        else:
            list_numbers.sort(key=lambda e: (e["y"], e["x"]))

        # 各NUMBERに最寄りのHEADINGとBODYをグループ化
        groups = []
        used_h = set()
        used_b = set()
        for num in list_numbers:
            # 最寄りHEADING
            best_h = None
            best_dist = float("inf")
            for j, h in enumerate(list_headings):
                if id(h) in used_h:
                    continue
                dist = ((h["x"] - num["x"])**2 + (h["y"] - num["y"])**2) ** 0.5
                if dist < best_dist:
                    best_dist = dist
                    best_h = (j, h)
            if best_h:
                used_h.add(id(best_h[1]))

            # 最寄りBODY（HEADINGの下）
            best_b = None
            if best_h:
                h_elem = best_h[1]
                best_b_dist = float("inf")
                for j, b in enumerate(list_bodies):
                    if id(b) in used_b:
                        continue
                    if b["y"] > h_elem["y"] - 10 and abs(b["x"] - h_elem["x"]) < 100:
                        dist = abs(b["y"] - h_elem["y"])
                        if dist < best_b_dist:
                            best_b_dist = dist
                            best_b = (j, b)
                if best_b:
                    used_b.add(id(best_b[1]))

            groups.append({
                "num": num,
                "heading": best_h[1] if best_h else None,
                "body": best_b[1] if best_b else None,
            })

        # 各グループのベースdelayをHEADINGのナレーション位置から取得
        base_delays = []
        narr_matched = []
        for g in groups:
            if g["heading"] and g["heading"].get("_narr_matched"):
                base_delays.append(g["heading"]["animation"]["delay"])
                narr_matched.append(True)
            else:
                base_delays.append(None)
                narr_matched.append(False)

        # 順序を強制 + マッチできなかった項目は前後の間を均等配置
        # まず、ナレーションとマッチした項目をアンカーとして記録
        matched = [(i, base_delays[i]) for i in range(len(base_delays))
                   if base_delays[i] is not None]

        # アンカーの順序を強制（前のアンカーより必ず後）
        for j in range(1, len(matched)):
            if matched[j][1] <= matched[j-1][1]:
                matched[j] = (matched[j][0], matched[j-1][1] + 1.5)

        # 未マッチ項目を前後のアンカー間で補間
        for i in range(len(base_delays)):
            if base_delays[i] is not None:
                # マッチ済み: アンカーの補正後の値を使う
                anchor = next((m for m in matched if m[0] == i), None)
                if anchor:
                    base_delays[i] = anchor[1]
                continue

            # 未マッチ: 前後のアンカーを探す
            prev_anchor = None
            next_anchor = None
            for m in matched:
                if m[0] < i:
                    prev_anchor = m
                elif m[0] > i and next_anchor is None:
                    next_anchor = m

            if prev_anchor and next_anchor:
                # 前後のアンカー間を均等配置
                gap_items = next_anchor[0] - prev_anchor[0]
                pos_in_gap = i - prev_anchor[0]
                span = next_anchor[1] - prev_anchor[1]
                base_delays[i] = prev_anchor[1] + span * pos_in_gap / gap_items
            elif prev_anchor:
                base_delays[i] = prev_anchor[1] + 3.0
            elif next_anchor:
                # 最初の未マッチ項目: 1.0sから開始し、次のアンカーまで均等配置
                gap_items = next_anchor[0] + 1
                span = next_anchor[1] - 1.0
                base_delays[i] = 1.0 + span * i / gap_items
            else:
                base_delays[i] = 1.0 + i * 2.0

        # グループ内の全要素に統一delayを適用
        for i, g in enumerate(groups):
            delay = round(base_delays[i], 2)
            g["num"]["animation"]["delay"] = delay
            if g["heading"]:
                g["heading"]["animation"]["delay"] = delay
            if g["body"]:
                g["body"]["animation"]["delay"] = round(delay + 0.3, 2)

    # 後処理: CONTENT_ICON を最寄りテキスト要素と同時に出現
    for el in elements:
        if el.get("label") == "CONTENT_ICON" and el.get("animation"):
            icon_cx = el["x"] + el["w"] / 2
            icon_cy = el["y"] + el["h"] / 2
            best = None
            best_dist = float("inf")
            for other in elements:
                if other.get("label") in ("LIST_HEADING", "LIST_BODY", "BODY_PARAGRAPH") and other.get("animation"):
                    cx = other["x"] + other["w"] / 2
                    cy = other["y"] + other["h"] / 2
                    dist = ((cx - icon_cx)**2 + (cy - icon_cy)**2) ** 0.5
                    if dist < best_dist:
                        best_dist = dist
                        best = other
            if best:
                el["animation"]["delay"] = best["animation"]["delay"]

    return elements


def main(narration_path, slides_json_path, audio_timing_path=None, use_api=False):
    # ナレーション読み込み
    with open(narration_path, encoding="utf-8") as f:
        narration_text = f.read()
    narration_slides = parse_narration(narration_text)
    print(f"Narration: {len(narration_slides)} slides parsed")

    # slides.json読み込み
    with open(slides_json_path, encoding="utf-8") as f:
        slides_data = json.load(f)

    # audio_timing読み込み
    audio_timing = None
    if audio_timing_path and os.path.exists(audio_timing_path):
        with open(audio_timing_path, encoding="utf-8") as f:
            audio_timing = json.load(f)

    # API client
    client = None
    if use_api:
        try:
            import anthropic
            client = anthropic.Anthropic()
            print("Using Claude API for matching")
        except Exception:
            print("[WARN] anthropic not available, using local matching only")
            use_api = False

    # スライドごとに同期
    for slide in slides_data["slides"]:
        si = slide["slide_index"]

        if si >= len(narration_slides):
            print(f"  Slide {si+1}: No narration (skipped)")
            continue

        narr = narration_slides[si]
        audio_dur = slide["duration"]

        if audio_timing and "slides" in audio_timing:
            ae = next((s for s in audio_timing["slides"] if s["slide_index"] == si), None)
            if ae:
                audio_dur = ae["duration_sec"]

        print(f"  Slide {si+1}: {narr['char_count']} chars, {audio_dur:.1f}s audio, {len(slide['elements'])} elements")

        slide["elements"] = sync_slide_elements(
            slide["elements"], narr, audio_dur,
            use_api=use_api, client=client
        )

    # _narr_matched フラグを除去
    for slide in slides_data["slides"]:
        for el in slide["elements"]:
            el.pop("_narr_matched", None)

    # 上書き保存
    with open(slides_json_path, "w", encoding="utf-8") as f:
        json.dump(slides_data, f, ensure_ascii=False, indent=2)

    print(f"\nDone: {slides_json_path} updated with narration-synced timing")


if __name__ == "__main__":
    narr_path = sys.argv[1] if len(sys.argv) > 1 else "data/narration.txt"
    slides_path = sys.argv[2] if len(sys.argv) > 2 else "data/slides.json"
    audio_path = sys.argv[3] if len(sys.argv) > 3 else "data/audio_timing.json"
    api_flag = "--api" in sys.argv

    if not os.path.exists(narr_path):
        print(f"[ERROR] {narr_path} not found", file=sys.stderr)
        sys.exit(1)

    main(narr_path, slides_path, audio_path, use_api=api_flag)