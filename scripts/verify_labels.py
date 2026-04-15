"""
verify_labels.py
ラベリング結果をターミナルに見やすく表示する確認ツール。
初回のみ実行。同一テンプレートなら以降はスキップ可。
"""

import sys
import os
import json


def verify_labels(labeled_path):
    """ラベリング結果をターミナルに見やすく表示する"""
    with open(labeled_path, encoding="utf-8") as f:
        data = json.load(f)

    total_elements = 0
    label_counts = {}

    for slide in data:
        print(f"\n{'='*60}")
        print(f"スライド {slide['slide_index']+1}  (type: {slide['slide_type']})")
        print(f"{'='*60}")

        for el in slide.get("elements", []):
            label = el["label"]
            desc = el.get("description", "")
            text_preview = (el.get("text") or "")[:40]
            icon_desc = el.get("icon_description", "")
            list_idx = el.get("list_index")

            total_elements += 1
            label_counts[label] = label_counts.get(label, 0) + 1

            parts = [f"  [{label:22s}]"]
            if list_idx is not None:
                parts.append(f"[#{list_idx}]")
            parts.append(desc)

            print(" ".join(parts))
            if text_preview:
                print(f"  {'':22s}  → \"{text_preview}\"")
            if icon_desc:
                print(f"  {'':22s}  🖼 {icon_desc}")

    print(f"\n{'='*60}")
    print(f"合計: {total_elements} 要素")
    print(f"\nラベル分布:")
    for label, count in sorted(label_counts.items(), key=lambda x: -x[1]):
        print(f"  {label:22s}: {count}")
    print()
    print("修正が必要な場合は labeled_elements.json を直接編集してください。")
    print("同一テンプレートのPPTXであれば、以降このステップはスキップ可能です。")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/labeled_elements.json"
    if not os.path.exists(path):
        print(f"[ERROR] {path} が見つかりません", file=sys.stderr)
        sys.exit(1)
    verify_labels(path)
