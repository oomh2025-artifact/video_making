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
    背景のみPNG生成時に「非表示処理」すべきシェイプを返す。

    戻り値: { slide_index: [(shape_id, kind), ...] }
      kind = 'text'    : テキストの中身だけを空にする(吹き出しやテキストボックスの
                          形・枠・塗りは背景PNGに残す)
      kind = 'picture' : シェイプ全体を画面外に退避する(アイコン等の画像)

    対象:
      1. has_text == True かつ text が空でない → kind='text'
      2. shape_type == "PICTURE" かつコンテンツエリア内 (top > 15% かつ top < 90%)
         → kind='picture'
      3. shape_type == "PICTURE" かつ名前に「グラフィックス」「Graphic」を含む
         → kind='picture'
    対象外:
      - ストライプパターン画像（ヘッダー/フッターと同位置のPICTURE）
      - 背景塗りつぶしのAUTO_SHAPE（テキストが空）
    """
    with open(raw_shapes_path, encoding="utf-8") as f:
        data = json.load(f)

    oh = data["output_height"]
    result = {}  # { slide_index: [(shape_id, kind), ...] }

    for slide in data["slides"]:
        hide_list = []
        for shape in slide["shapes"]:
            sid = shape["shape_id"]
            top_pct = shape["y"] / oh * 100 if oh > 0 else 0

            # 条件1: テキストあり → テキストだけ消去(形は残す)
            if shape["has_text"] and shape["text"] and shape["text"].strip():
                hide_list.append((sid, "text"))
                continue

            # 条件2 & 3: PICTURE判定 → 画面外退避
            if shape["is_picture"]:
                name = shape["name"]
                # 条件3: 名前にグラフィックス/Graphicを含む
                if "グラフィックス" in name or "Graphic" in name:
                    hide_list.append((sid, "picture"))
                    continue
                # 条件2: コンテンツエリア内のPICTURE
                if 15 < top_pct < 90:
                    hide_list.append((sid, "picture"))
                    continue
                # ストライプパターン（top < 15% or top > 90%）は非表示にしない

        result[slide["slide_index"]] = hide_list

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
    """
    背景のみ版PNG書き出し:
      - kind='picture': 画面外に退避してから書き出し、後で元に戻す
      - kind='text'   : テキストの中身だけを空にしてから書き出し、後で元に戻す
                        (シェイプの形・枠・塗りは背景PNGに残る)
    変更は保存しないので、入力PPTXファイルは書き換わらない。
    """
    import comtypes.client

    pptx_abs = os.path.abspath(pptx_path)
    output_abs = os.path.abspath(output_dir)
    os.makedirs(output_abs, exist_ok=True)

    ppt_app = comtypes.client.CreateObject("PowerPoint.Application")
    ppt_app.Visible = 1

    try:
        presentation = ppt_app.Presentations.Open(pptx_abs, WithWindow=False)

        for slide_index, hide_list in shapes_to_hide.items():
            slide = presentation.Slides(slide_index + 1)  # COM は 1-indexed

            # shape_id -> kind の辞書化
            kind_map = {sid: kind for sid, kind in hide_list}

            originals_left = {}  # kind='picture' の退避情報
            originals_text = {}  # kind='text'    の退避情報

            # 非表示処理
            for j in range(1, slide.Shapes.Count + 1):
                shape = slide.Shapes(j)
                kind = kind_map.get(shape.Id)
                if kind is None:
                    continue

                if kind == "picture":
                    # 画像系は画面外に退避
                    originals_left[shape.Id] = shape.Left
                    shape.Left = -9999
                elif kind == "text":
                    # テキスト持ちは中身だけ空にする
                    try:
                        if shape.HasTextFrame:
                            tf = shape.TextFrame
                            if tf.HasText:
                                originals_text[shape.Id] = tf.TextRange.Text
                                tf.TextRange.Text = ""
                    except Exception as e:
                        print(f"  [WARN] shape {shape.Id} のテキスト消去に失敗: {e}",
                              file=sys.stderr)

            # 背景のみ版PNG書き出し
            bg_path = os.path.join(output_abs, f"slide_{slide_index+1:02d}_bg.png")
            slide.Export(bg_path, "PNG", OUTPUT_WIDTH, OUTPUT_HEIGHT)
            print(f"  背景版: slide_{slide_index+1:02d}_bg.png")

            # 元に戻す
            for j in range(1, slide.Shapes.Count + 1):
                shape = slide.Shapes(j)
                if shape.Id in originals_left:
                    shape.Left = originals_left[shape.Id]
                if shape.Id in originals_text:
                    try:
                        shape.TextFrame.TextRange.Text = originals_text[shape.Id]
                    except Exception as e:
                        print(f"  [WARN] shape {shape.Id} のテキスト復元に失敗: {e}",
                              file=sys.stderr)

        # 念のため「変更なし」扱いにして、Close時の保存ダイアログを抑制
        try:
            presentation.Saved = True
        except Exception:
            pass

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