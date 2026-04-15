"""
label_elements.py
フルスライドPNGをClaude Vision APIに送信し、各要素にラベルを付与する。
出力: data/labeled_elements.json

環境変数 ANTHROPIC_API_KEY が必要。
"""

import sys
import os
import json
import base64
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

LABELING_PROMPT = """
このスライド画像を分析し、以下のJSON形式で全要素をラベリングしてください。

## ラベル一覧（この中から必ず1つ選択）

背景層（アニメーションなし）:
- BG_FILL: スライド全体の背景塗り
- HEADER_STRIPE: 上部のストライプ装飾帯
- FOOTER_STRIPE: 下部のストライプ装飾帯
- TITLE_LINE: タイトル下の区切り線
- BOTTOM_BAR: 下部灰色まとめバー（テキスト無し部分）
- LIST_DIVIDER: リスト項目間の区切り線
- CONTENT_AREA_BG: コンテンツ領域の背景図形
- ACCENT_SHAPE: その他の装飾図形

コンテンツ層（アニメーション対象）:
- COVER_TITLE: 表紙のメインタイトル
- SLIDE_TITLE: 各スライドのタイトル
- BODY_PARAGRAPH: 本文テキスト（段落形式）
- LIST_NUMBER: 番号付きリストの数字
- LIST_HEADING: リスト項目の見出し
- LIST_BODY: リスト項目の説明文
- SOURCE_CITATION: 出典・引用テキスト
- BOTTOM_TAKEAWAY: 下部まとめメッセージのテキスト
- PAGE_NUMBER: ページ番号

ビジュアル層（アニメーション対象）:
- CONTENT_ICON: コンテンツ用アイコン・イラスト
- BOTTOM_TAKEAWAY_ICON: まとめバー内のアイコン
- LOGO: ロゴ画像
- CHART_IMAGE: グラフ・チャート画像

## ルール
- 1つの要素に対して必ず1つのラベルを付与する
- スライド内の全ての視覚的要素を網羅する
- descriptionには要素の内容を日本語で簡潔に記述する
- slide_typeは "cover" | "paragraph" | "list" | "end" から判定する
  - cover: 表紙（大きなタイトルが中央配置）
  - paragraph: タイトル＋段落テキスト（番号付きリストなし）
  - list: タイトル＋番号付きリスト（1, 2, 3...が並ぶ）
  - end: 終了スライド（画像のみ等）
- JSONのみ出力。マークダウンのコードブロックや説明文は不要

## 出力JSON
{
    "slide_type": "paragraph" | "list" | "cover" | "end",
    "elements": [
        {
            "description": "要素の説明（日本語）",
            "label": "SLIDE_TITLE",
            "text": "テキスト内容" | null,
            "icon_description": "アイコンの内容説明" | null,
            "list_index": null | 0 | 1 | 2 | 3
        }
    ]
}
"""


def label_slide(slide_image_path, client):
    """1枚のスライドをVision APIでラベリングする"""
    with open(slide_image_path, "rb") as f:
        img_b64 = base64.standard_b64encode(f.read()).decode()

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img_b64}},
                {"type": "text", "text": LABELING_PROMPT}
            ]
        }]
    )

    result_text = response.content[0].text.strip()
    # コードブロックが含まれている場合に備えてクリーニング
    if result_text.startswith("```"):
        result_text = result_text.split("\n", 1)[1].rsplit("```", 1)[0]

    return json.loads(result_text)


def main(data_dir="data", assets_dir="assets"):
    try:
        import anthropic
    except ImportError:
        print("[ERROR] anthropic パッケージが必要です: pip install anthropic", file=sys.stderr)
        sys.exit(1)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("[ERROR] 環境変数 ANTHROPIC_API_KEY を設定してください", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic()
    slides_dir = os.path.join(assets_dir, "slides")

    # フルPNGの一覧を取得
    full_pngs = sorted([
        f for f in os.listdir(slides_dir)
        if f.endswith("_full.png")
    ])

    if not full_pngs:
        print("[ERROR] フルPNGが見つかりません。先に export_slides.py を実行してください。", file=sys.stderr)
        sys.exit(1)

    print(f"{len(full_pngs)} スライドのラベリングを開始...")
    results = []

    for png_file in full_pngs:
        slide_num = int(png_file.split("_")[1])
        slide_index = slide_num - 1
        png_path = os.path.join(slides_dir, png_file)

        print(f"  スライド {slide_num}: ラベリング中...")

        # リトライ付き（最大2回）
        for attempt in range(2):
            try:
                result = label_slide(png_path, client)
                result["slide_index"] = slide_index
                results.append(result)
                elem_count = len(result.get("elements", []))
                print(f"    → {result.get('slide_type', '?')}, {elem_count} 要素")
                break
            except json.JSONDecodeError as e:
                if attempt == 0:
                    print(f"    [WARN] JSONパース失敗、リトライ中... ({e})")
                    time.sleep(2)
                else:
                    print(f"    [ERROR] 2回目もJSONパース失敗。未分類として続行。")
                    results.append({
                        "slide_index": slide_index,
                        "slide_type": "paragraph",
                        "elements": []
                    })
            except Exception as e:
                print(f"    [ERROR] API呼び出し失敗: {e}")
                traceback.print_exc()
                results.append({
                    "slide_index": slide_index,
                    "slide_type": "paragraph",
                    "elements": []
                })
                break

        # レート制限回避
        time.sleep(1)

    # 結果を保存
    output_path = os.path.join(data_dir, "labeled_elements.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n完了: {output_path}")


if __name__ == "__main__":
    main()
