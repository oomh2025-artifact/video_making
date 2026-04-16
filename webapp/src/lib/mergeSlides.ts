/**
 * 全体マージ処理: RawShapesData → SlidesData 生成
 * Python版 merge_and_assign.py の main() 移植
 */
import type {
  RawShapesData, RawShape, SlidesData, Slide, SlideElement,
  SlideType, ElementLabel, AnyLabel,
} from "../types/slides";
import type { TimingEntry } from "./timingParser";
import { inferSlideType, labelShape } from "./labeler";
import { ANIMATION_RULES, calculateDelays } from "./animationAssigner";

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

/** スライドduration決定 */
function getSlideDuration(
  slideIndex: number,
  timingEntries: TimingEntry[],
  elements: SlideElement[],
  slideType: SlideType
): number {
  const entry = timingEntries.find((t) => t.slideIndex === slideIndex);
  if (entry) return entry.durationSec;
  return calculateFallbackDuration(elements, slideType);
}

function calculateFallbackDuration(elements: SlideElement[], slideType: SlideType): number {
  if (slideType === "cover") return 5.0;
  if (slideType === "end") return 4.0;
  if (slideType === "list") {
    const listCount = elements.filter((e) => e.label === "LIST_NUMBER").length;
    return 3.0 + listCount * 1.5 + 2.0;
  }
  if (slideType === "paragraph") {
    const totalChars = elements.reduce((sum, e) => sum + (e.text?.length || 0), 0);
    return Math.max(6.0, 3.0 + (totalChars / 100) * 2.0 + 2.0);
  }
  return 8.0;
}

/** シェイプをslides.json用のelement形式に変換 */
function shapeToElement(
  shape: RawShape,
  label: AnyLabel,
  slideIndex: number,
  elIndex: number
): SlideElement | null {
  // 背景ラベルはshapeToElementでは処理しない（ループ側で分離済み）
  if (BG_LABELS.has(label as string)) return null;

  // アニメーションルール（なければデフォルトfadeIn）
  const rule = ANIMATION_RULES[label] ?? {
    type: "fadeIn" as const,
    delay: 0,
    duration: 0.5,
  };

  // タイプ判定
  let elType: "text" | "richText" | "icon" | "image" = "text";
  if (shape.is_picture) {
    elType = "icon";
  } else if (shape.text_runs && shape.text_runs.length > 2) {
    const colors = new Set<string>();
    const bolds = new Set<boolean>();
    for (const r of shape.text_runs) {
      if (r.text === "\n") continue;
      if (r.font_color) colors.add(r.font_color);
      bolds.add(r.bold);
    }
    if (colors.size > 1 || bolds.size > 1) elType = "richText";
  }

  const element: SlideElement = {
    id: `s${String(slideIndex + 1).padStart(2, "0")}_el_${String(elIndex + 1).padStart(2, "0")}`,
    label: label as ElementLabel,
    type: elType,
    x: shape.x,
    y: shape.y,
    w: shape.w,
    h: shape.h,
    animation: {
      type: rule.type,
      delay: rule.delay ?? 0,
      duration: rule.duration,
    },
  };

  if (shape.has_text && shape.text) {
    element.text = shape.text;
  }

  // フォントスタイル
  if (shape.text_runs) {
    const runs = shape.text_runs.filter((r) => r.text !== "\n");
    if (runs.length > 0) {
      const sizes = runs.map((r) => r.font_size_pt).filter((s): s is number => s !== null);
      element.fontSize = sizes.length > 0 ? Math.max(...sizes) : 16;
      const colors = runs.map((r) => r.font_color).filter((c): c is string => c !== null);
      element.fontColor = colors[0] || "#333333";
      element.fontWeight = runs.some((r) => r.bold) ? "bold" : "normal";
      element.lineHeight = 1.5;
    }
  }

  // richText spans
  if (elType === "richText" && shape.text_runs) {
    element.spans = shape.text_runs.map((r) => {
      const span: { text: string; color?: string; bold?: boolean } = { text: r.text };
      if (r.font_color) span.color = r.font_color;
      if (r.bold) span.bold = true;
      return span;
    });
  }

  // アイコン
  if (shape.is_picture) {
    element.type = "icon";
    if (shape.imageBlobUrl) {
      element.iconSrc = shape.imageBlobUrl;
    } else if (shape.image_filename) {
      element.iconSrc = `icons/${shape.image_filename}`;
    }
    delete element.text;
    delete element.fontSize;
    delete element.fontColor;
    delete element.fontWeight;
    delete element.lineHeight;
    delete element.spans;
  }

  // 装飾シェイプ（テキストなし・画像なし）に背景色を設定
  if (!shape.is_picture && !shape.has_text && shape.fill_color) {
    element.bgColor = shape.fill_color;
  }

  return element;
}

/* ================================================================ */
/*  背景生成ユーティリティ                                          */
/* ================================================================ */
const BG_LABELS = new Set([
  "BG_FILL", "HEADER_STRIPE", "FOOTER_STRIPE",
]);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** 背景シェイプからスライド背景画像を生成 */
async function generateBackground(
  bgShapes: Array<{ shape: RawShape; label: AnyLabel }>
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  // 大きいシェイプを先に描画（z-order近似）
  bgShapes.sort((a, b) => (b.shape.w * b.shape.h) - (a.shape.w * a.shape.h));

  for (const { shape } of bgShapes) {
    if (shape.imageBlobUrl) {
      try {
        const img = await loadImage(shape.imageBlobUrl);
        ctx.drawImage(img, shape.x, shape.y, shape.w, shape.h);
      } catch {
        // 画像ロード失敗時はスキップ
      }
    } else if (shape.fill_color) {
      ctx.fillStyle = shape.fill_color;
      ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
    }
  }

  return canvas.toDataURL("image/png");
}

/** メイン処理: RawShapesDataからSlidesDataを生成 */
export async function mergeAndAssign(
  rawData: RawShapesData,
  timingEntries: TimingEntry[],
  _narrations: string[]
): Promise<SlidesData> {
  const slidesOutput: Slide[] = [];

  for (const rawSlide of rawData.slides) {
    const si = rawSlide.slide_index;
    const shapes = rawSlide.shapes;

    // スライドタイプ推定
    const slideType = inferSlideType(shapes, si);
    const slideHasList = slideType === "list";

    // 各シェイプにラベル付与
    const labeledShapes: [RawShape, AnyLabel][] = [];
    for (const shape of shapes) {
      const label = labelShape(shape, si, slideHasList, slideType);
      labeledShapes.push([shape, label]);
    }

    // 背景シェイプを収集 & コンテンツ要素を生成
    const bgShapes: Array<{ shape: RawShape; label: AnyLabel }> = [];
    const elements: SlideElement[] = [];
    let elIdx = 0;
    for (const [shape, label] of labeledShapes) {
      if (BG_LABELS.has(label)) {
        bgShapes.push({ shape, label });
      } else {
        const el = shapeToElement(shape, label, si, elIdx);
        if (el) {
          elements.push(el);
          elIdx++;
        }
      }
    }

    // 背景画像を生成
    let bgSrc: string;
    if (bgShapes.length > 0) {
      bgSrc = await generateBackground(bgShapes);
    } else {
      bgSrc = ""; // 背景シェイプなし
    }

    // duration決定
    const duration = getSlideDuration(si, timingEntries, elements, slideType);

    // delay動的計算
    calculateDelays(elements, slideType, duration);

    // BOTTOM_TAKEAWAY テキストの位置をアイコン分ずらす
    const takeawayIcon = elements.find((e) => e.label === "BOTTOM_TAKEAWAY_ICON");
    if (takeawayIcon) {
      const iconRight = takeawayIcon.x + takeawayIcon.w + 10;
      for (const e of elements) {
        if (e.label === "BOTTOM_TAKEAWAY" && e.text && e.x < iconRight) {
          const oldX = e.x;
          e.x = iconRight;
          e.w = e.w - (iconRight - oldX);
        }
      }
    }

    slidesOutput.push({
      slide_index: si,
      slide_type: slideType,
      duration: Math.round(duration * 100) / 100,
      background: { src: bgSrc },
      audio: null,
      elements,
    });
  }

  return {
    meta: {
      source_file: rawData.source_file,
      total_slides: slidesOutput.length,
      output_width: OUTPUT_WIDTH,
      output_height: OUTPUT_HEIGHT,
      fps: 30,
    },
    slides: slidesOutput,
  };
}