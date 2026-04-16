/**
 * ルールベースラベリング
 * Python版 merge_and_assign.py の assign_label_by_position / assign_label_by_text_and_position 移植
 */
import type { RawShape, AnyLabel, SlideType } from "../types/slides";

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

/** テキストなしシェイプの位置ベースラベリング */
export function labelByPosition(shape: RawShape): AnyLabel {
  const topPct = (shape.y / OUTPUT_HEIGHT) * 100;
  const wPct = (shape.w / OUTPUT_WIDTH) * 100;
  const hPct = (shape.h / OUTPUT_HEIGHT) * 100;

  if (wPct > 95 && hPct > 95) return "BG_FILL";
  if (topPct < 1 && hPct < 6 && wPct > 90) return "HEADER_STRIPE";
  if (topPct > 93 && hPct < 6 && wPct > 90) return "FOOTER_STRIPE";
  if (hPct < 1.5 && topPct > 14 && topPct < 22 && wPct > 50) return "TITLE_LINE";
  if (topPct > 75 && topPct < 85 && hPct > 5 && hPct < 15 && wPct > 70) {
    if (shape.fill_color !== null) return "BOTTOM_BAR";
  }
  if (hPct < 1.5 && topPct > 20 && topPct < 80 && wPct > 50) return "LIST_DIVIDER";
  if (topPct > 15 && topPct < 30 && hPct > 30 && wPct > 30) {
    if (shape.fill_color !== null) return "CONTENT_AREA_BG";
  }
  return "ACCENT_SHAPE";
}

/** テキストありシェイプのラベリング */
export function labelByTextAndPosition(
  shape: RawShape,
  slideHasList: boolean,
  slideType: SlideType
): AnyLabel {
  const text = (shape.text || "").trim();
  const topPct = (shape.y / OUTPUT_HEIGHT) * 100;
  const wPct = (shape.w / OUTPUT_WIDTH) * 100;
  const hPct = (shape.h / OUTPUT_HEIGHT) * 100;

  if (text.includes("/") && topPct > 88 && text.length < 10) return "PAGE_NUMBER";
  if (slideType === "cover" && wPct > 40 && hPct > 15 && text.length > 3) return "COVER_TITLE";
  if (topPct < 18 && wPct > 45) return "SLIDE_TITLE";
  if (/出典|参考|引用/.test(text)) return "SOURCE_CITATION";
  if (/^\d$/.test(text) && shape.w < 120) return "LIST_NUMBER";
  if (/^0\d$/.test(text) && shape.w < 120) return "LIST_NUMBER";
  if (topPct > 75 && topPct < 85 && wPct > 50) return "BOTTOM_TAKEAWAY";

  if (slideHasList && topPct > 20 && topPct < 80) {
    const runs = shape.text_runs || [{ font_size_pt: 0 } as any];
    const maxFontSize = Math.max(...runs.map((r) => r.font_size_pt || 0));
    if (text.length < 20 && maxFontSize >= 14) return "LIST_HEADING";
    return "LIST_BODY";
  }

  return "BODY_PARAGRAPH";
}

/** 画像シェイプのラベリング */
export function labelPicture(
  shape: RawShape,
  slideIndex: number
): AnyLabel {
  const topPct = (shape.y / OUTPUT_HEIGHT) * 100;

  // 上下のストライプ画像（しきい値を非画像版と統一）
  if (topPct < 5 || topPct >= 93) {
    return topPct < 5 ? "HEADER_STRIPE" : "FOOTER_STRIPE";
  }
  if (topPct > 75 && topPct < 90 && shape.w < 80) return "BOTTOM_TAKEAWAY_ICON";
  if (slideIndex === 0 && topPct > 70) return "LOGO";
  return "CONTENT_ICON";
}

/** スライドタイプを推定 */
export function inferSlideType(shapes: RawShape[], slideIndex: number): SlideType {
  const hasDigitShapes = shapes.some(
    (s) => s.has_text && s.text?.trim().length === 1 && /^\d$/.test(s.text.trim())
  );
  const hasOnlyImages = shapes.length > 0 && shapes.every((s) => s.is_picture);

  if (hasOnlyImages || shapes.length <= 1) return "end";
  if (slideIndex === 0) return "cover";
  if (hasDigitShapes) return "list";
  return "paragraph";
}

/** シェイプにラベルを付与 */
export function labelShape(
  shape: RawShape,
  slideIndex: number,
  slideHasList: boolean,
  slideType: SlideType
): AnyLabel {
  // 画像シェイプ
  if (shape.is_picture) {
    return labelPicture(shape, slideIndex);
  }
  // テキストなし
  if (!shape.has_text || !shape.text?.trim()) {
    return labelByPosition(shape);
  }
  // テキストあり
  return labelByTextAndPosition(shape, slideHasList, slideType);
}
