"""共通定数と変換ユーティリティ"""

# PPTXの座標単位（EMU: English Metric Units）
EMU_PER_INCH = 914400
EMU_PER_PT = 12700

# 出力映像サイズ
OUTPUT_WIDTH = 1920
OUTPUT_HEIGHT = 1080

# デフォルトパス
DEFAULT_DATA_DIR = "data"
DEFAULT_ASSETS_DIR = "assets"


def emu_to_px(emu_value, slide_dimension_emu, output_dimension):
    """EMU値をピクセルに変換する。スライドサイズに対する比率で計算。"""
    if slide_dimension_emu == 0:
        return 0
    return round(emu_value / slide_dimension_emu * output_dimension)
