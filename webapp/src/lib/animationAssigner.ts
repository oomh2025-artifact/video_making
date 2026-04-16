/**
 * アニメーション割り当て + delay動的計算
 * Python版 merge_and_assign.py の ANIMATION_RULES + calculate_delays 移植
 */
import type { SlideElement, SlideType, AnimationType, AnyLabel } from "../types/slides";

interface AnimationRule {
  type: AnimationType;
  delay: number | null;
  duration: number;
}

// ラベルごとのアニメーションルール（null = 背景層、出力に含めない）
export const ANIMATION_RULES: Record<string, AnimationRule | null> = {
  // 背景層
  BG_FILL: null,
  HEADER_STRIPE: null,
  FOOTER_STRIPE: null,
  TITLE_LINE: null,
  BOTTOM_BAR: null,
  LIST_DIVIDER: null,
  CONTENT_AREA_BG: null,
  ACCENT_SHAPE: null,
  // コンテンツ層
  COVER_TITLE:     { type: "fadeIn",        delay: 0.0,  duration: 0.6 },
  SLIDE_TITLE:     { type: "fadeIn",        delay: 0.0,  duration: 0.4 },
  BODY_PARAGRAPH:  { type: "fadeIn",        delay: 1.0,  duration: 0.6 },
  LIST_NUMBER:     { type: "scaleIn",       delay: null, duration: 0.3 },
  LIST_HEADING:    { type: "slideInLeft",   delay: null, duration: 0.4 },
  LIST_BODY:       { type: "fadeIn",        delay: null, duration: 0.4 },
  SOURCE_CITATION: { type: "fadeIn",        delay: null, duration: 0.3 },
  BOTTOM_TAKEAWAY: { type: "slideInBottom", delay: null, duration: 0.5 },
  PAGE_NUMBER:     { type: "fadeIn",        delay: 0.0,  duration: 0.2 },
  // ビジュアル層
  CONTENT_ICON:         { type: "scaleIn", delay: null, duration: 0.4 },
  BOTTOM_TAKEAWAY_ICON: { type: "scaleIn", delay: null, duration: 0.3 },
  LOGO:                 { type: "fadeIn",  delay: 1.0,  duration: 0.5 },
  CHART_IMAGE:          { type: "fadeIn",  delay: null, duration: 0.5 },
};

/** ラベルが背景層かどうか */
export function isBackgroundLabel(label: AnyLabel): boolean {
  return ANIMATION_RULES[label] === null || ANIMATION_RULES[label] === undefined;
}

/** アイコンに最も近いテキスト要素を探す */
function findNearestTextElement(iconEl: SlideElement, allElements: SlideElement[]): SlideElement | null {
  const iconCx = iconEl.x + iconEl.w / 2;
  const iconCy = iconEl.y + iconEl.h / 2;

  const candidates = allElements.filter(
    (e) => ["BODY_PARAGRAPH", "LIST_HEADING", "LIST_BODY", "SLIDE_TITLE"].includes(e.label)
  );
  if (candidates.length === 0) return null;

  let best: SlideElement | null = null;
  let bestDist = Infinity;
  for (const e of candidates) {
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const dist = Math.sqrt((cx - iconCx) ** 2 + (cy - iconCy) ** 2);
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  return best;
}

/** target要素の直上にある要素を探す */
function findElementAbove(target: SlideElement, allElements: SlideElement[]): SlideElement | null {
  const candidates = allElements.filter(
    (e) => e.y + e.h < target.y && e.animation.delay !== null && e.text
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.y > a.y ? b : a));
}

/** 各要素のdelayを動的に計算 */
export function calculateDelays(
  elements: SlideElement[],
  slideType: SlideType,
  slideDuration: number
): SlideElement[] {
  // リストスライドのstagger計算
  if (slideType === "list") {
    const listItems = elements.filter((e) => e.label === "LIST_NUMBER");

    if (listItems.length >= 2) {
      const yValues = listItems.map((e) => e.y);
      const yRange = Math.max(...yValues) - Math.min(...yValues);
      if (yRange < 100) {
        listItems.sort((a, b) => a.x - b.x);
      } else {
        listItems.sort((a, b) => a.y - b.y || a.x - b.x);
      }
    }

    const BASE_DELAY = 1.0;
    const STAGGER_INTERVAL = 1.2;

    for (let i = 0; i < listItems.length; i++) {
      listItems[i].animation.delay = BASE_DELAY + i * STAGGER_INTERVAL;
    }

    // LIST_NUMBERの背景四角（同じy座標にある非テキストシェイプ）も同じdelayにする
    // → SlidePreviewではLIST_NUMBERを四角+数字で一体描画するため、
    //   ここではLIST_NUMBERのdelay設定だけで四角と数字が同時に出る

    // HEADING/BODYを最寄りLIST_NUMBERに割り当て
    for (const e of elements) {
      if (e.label !== "LIST_HEADING" && e.label !== "LIST_BODY") continue;

      let best: SlideElement | null = null;
      let bestDist = Infinity;

      for (const item of listItems) {
        if (item.y <= e.y + 50 && item.x <= e.x + 50) {
          const dist = Math.sqrt((e.x - item.x) ** 2 + (e.y - item.y) ** 2);
          if (dist < bestDist) {
            bestDist = dist;
            best = item;
          }
        }
      }

      if (!best) {
        for (const item of listItems) {
          const dist = Math.sqrt((e.x - item.x) ** 2 + (e.y - item.y) ** 2);
          if (dist < bestDist) {
            bestDist = dist;
            best = item;
          }
        }
      }

      if (best) {
        if (e.label === "LIST_HEADING") {
          e.animation.delay = best.animation.delay;
        } else {
          e.animation.delay = best.animation.delay + 0.3;
        }
      }
    }
  }

  // BODY_PARAGRAPH: 同じスライド内に複数ある場合、Y座標順にstagger
  const bodyParagraphs = elements
    .filter((e) => e.label === "BODY_PARAGRAPH")
    .sort((a, b) => a.y - b.y);
  if (bodyParagraphs.length >= 2) {
    const BASE_DELAY = 1.0;
    const STAGGER = 0.5;
    bodyParagraphs.forEach((e, i) => {
      e.animation.delay = BASE_DELAY + i * STAGGER;
    });
  }

  // CONTENT_ICON: 最も近いテキスト要素と同時
  for (const e of elements) {
    if (e.label === "CONTENT_ICON") {
      const nearest = findNearestTextElement(e, elements);
      if (nearest && nearest.animation.delay !== null) {
        e.animation.delay = nearest.animation.delay;
      } else {
        e.animation.delay = 0.5;
      }
    }
  }

  // SOURCE_CITATION: 直上テキスト + 0.5s
  for (const e of elements) {
    if (e.label === "SOURCE_CITATION") {
      const prev = findElementAbove(e, elements);
      if (prev) {
        e.animation.delay = prev.animation.delay + prev.animation.duration + 0.5;
      } else {
        e.animation.delay = 3.0;
      }
    }
  }

  // BOTTOM_TAKEAWAY: 読み時間から逆算
  for (const e of elements) {
    if (e.label === "BOTTOM_TAKEAWAY") {
      const text = e.text || "";
      const readTime = text.length / 4.0 + 1.0;
      e.animation.delay = Math.max(3.0, slideDuration - readTime);
    }
  }

  // BOTTOM_TAKEAWAY_ICON: TAKEAWAYと同時
  const takeawayDelay =
    elements.find((e) => e.label === "BOTTOM_TAKEAWAY")?.animation.delay ??
    Math.max(3.0, slideDuration - 2.0);
  for (const e of elements) {
    if (e.label === "BOTTOM_TAKEAWAY_ICON") {
      e.animation.delay = takeawayDelay;
    }
  }

  // CHART_IMAGE: BODY_PARAGRAPH + 0.3s
  for (const e of elements) {
    if (e.label === "CHART_IMAGE") {
      const body = elements.find((el) => el.label === "BODY_PARAGRAPH");
      if (body && body.animation.delay !== null) {
        e.animation.delay = body.animation.delay + 0.3;
      } else {
        e.animation.delay = 1.5;
      }
    }
  }

  // 残りのnullにデフォルト値
  for (const e of elements) {
    if (e.animation.delay === null || e.animation.delay === undefined) {
      e.animation.delay = 1.0;
    }
  }

  return elements;
}
