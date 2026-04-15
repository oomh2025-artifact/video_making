"""
export_slides.py
PowerPoint COM経由でスライドをPNG画像として書き出す。
  - フル版PNG（全要素表示）: Vision API入力用
  - 背景のみPNG（テキスト/アイコン非表示）: Remotion背景用

Windows + PowerPointインストール済みの環境でのみ動作する。
"""

import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from constants import OUTPUT_WIDTH, OUTPUT_HEIGHT


def get_shapes_to_hide(raw_shapes_path):
    """
    非表示にすべきシェイプのIDをスライドごとに取得する。

    非表示対象:
      1. has_text == True かつ text が空でない
      2. shape_type == "PICTURE" かつコンテンツエリア内 (top > 15% かつ top < 90%)
      3. shape_type == "PICTURE" かつ名前に「グラフィックス」「Graphic」を含む
    非表示にしない:
      - ストライプパターン画像（ヘッダー/フッターと同位置のPICTURE）
      - 背景塗りつぶしのAUTO_SHAPE（テキストが空）
    """
    with open(raw_shapes_path, encoding="utf-8") as f:
        data = json.load(f)

    oh = data["output_height"]
    result = {}  # { slide_index: [shape_id, ...] }

    for slide in data["slides"]:
        hide_ids = []
        for shape in slide["shapes"]:
            sid = shape["shape_id"]
            top_pct = shape["y"] / oh * 100 if oh > 0 else 0

            # 条件1: テキストあり
            if shape["has_text"] and shape["text"] and shape["text"].strip():
                hide_ids.append(sid)
                continue

            # 条件2 & 3: PICTURE判定
            if shape["is_picture"]:
                name = shape["name"]
                # 条件3: 名前にグラフィックス/Graphicを含む
                if "グラフィックス" in name or "Graphic" in name:
                    hide_ids.append(sid)
                    continue
                # 条件2: コンテンツエリア内のPICTURE
                if 15 < top_pct < 90:
                    hide_ids.append(sid)
                    continue
                # ストライプパターン（top < 5% or top > 95%）は非表示にしない

        result[slide["slide_index"]] = hide_ids

    return result


def export_full_slides(pptx_path, output_dir):
    """全要素を含む状態でPNG書き出し"""
    import comtypes.client

    pptx_abs = os.path.abspath(pptx_path)
    output_abs = os.path.abspath(output_dir)
    os.makedirs(output_abs, exist_ok=True)

    ppt_app = comtypes.client.CreateObject("PowerPoint.Application")
    ppt_app.Visible = 1

    try:
        presentation = ppt_app.Presentations.Open(pptx_abs, WithWindow=False)

        slide_count = presentation.Slides.Count
        for i in range(1, slide_count + 1):
            slide = presentation.Slides(i)
            full_path = os.path.join(output_abs, f"slide_{i:02d}_full.png")
            slide.Export(full_path, "PNG", OUTPUT_WIDTH, OUTPUT_HEIGHT)
            print(f"  フル版: slide_{i:02d}_full.png")

        presentation.Close()
    finally:
        ppt_app.Quit()


def export_bg_only(pptx_path, shapes_to_hide, output_dir):
    """シェイプを一時的に画面外に退避してからPNG書き出し"""
    import comtypes.client

    pptx_abs = os.path.abspath(pptx_path)
    output_abs = os.path.abspath(output_dir)
    os.makedirs(output_abs, exist_ok=True)

    ppt_app = comtypes.client.CreateObject("PowerPoint.Application")
    ppt_app.Visible = 1

    try:
        presentation = ppt_app.Presentations.Open(pptx_abs, WithWindow=False)

        for slide_index, hide_ids in shapes_to_hide.items():
            slide = presentation.Slides(slide_index + 1)  # COM は 1-indexed

            # 非表示対象のシェイプを退避
            originals = {}
            for j in range(1, slide.Shapes.Count + 1):
                shape = slide.Shapes(j)
                if shape.Id in hide_ids:
                    originals[shape.Id] = shape.Left
                    shape.Left = -9999  # 画面外へ

            # 背景のみ版PNG書き出し
            bg_path = os.path.join(output_abs, f"slide_{slide_index+1:02d}_bg.png")
            slide.Export(bg_path, "PNG", OUTPUT_WIDTH, OUTPUT_HEIGHT)
            print(f"  背景版: slide_{slide_index+1:02d}_bg.png")

            # シェイプを元の位置に戻す
            for j in range(1, slide.Shapes.Count + 1):
                shape = slide.Shapes(j)
                if shape.Id in originals:
                    shape.Left = originals[shape.Id]

        # 変更を保存せずに閉じる
        presentation.Close()
    finally:
        ppt_app.Quit()


def main(pptx_path, data_dir="data", assets_dir="assets"):
    raw_shapes_path = os.path.join(data_dir, "raw_shapes.json")
    if not os.path.exists(raw_shapes_path):
        print(f"[ERROR] raw_shapes.json が見つかりません。先に extract_shapes.py を実行してください。",
              file=sys.stderr)
        sys.exit(1)

    slides_dir = os.path.join(assets_dir, "slides")

    print("[1/2] フル版PNG書き出し...")
    export_full_slides(pptx_path, slides_dir)

    print("[2/2] 背景のみ版PNG書き出し...")
    shapes_to_hide = get_shapes_to_hide(raw_shapes_path)
    export_bg_only(pptx_path, shapes_to_hide, slides_dir)

    print("\n完了")


if __name__ == "__main__":
    pptx_file = sys.argv[1] if len(sys.argv) > 1 else "input.pptx"
    main(pptx_file)
