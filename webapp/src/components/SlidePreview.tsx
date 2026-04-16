import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import type { Slide, SlideElement } from "../types/slides";
import { labelJa } from "../lib/labelNames";

export interface SlidePreviewHandle {
  /** 1920x1080のスライドキャンバスDOM */
  getCanvasEl: () => HTMLDivElement | null;
  /** 背景画像の加工が完了しているか */
  isReady: () => boolean;
}

interface Props {
  slide: Slide;
  currentTime: number;
  selectedElementId: string | null;
  editMode: boolean;
  onSelectElement: (id: string) => void;
}

const SLIDE_W = 1920;
const SLIDE_H = 1080;
const FONT_SCALE = 2.0;
const FONT_FAMILY = "'Meiryo', 'メイリオ', 'Noto Sans JP', sans-serif";

/** Remotion準拠のアニメーション計算 */
function getAnimationStyle(
  el: SlideElement,
  currentTime: number
): { opacity: number; transform: string } {
  const { delay, duration, type } = el.animation;
  const elapsed = currentTime - delay;

  if (elapsed < 0) return { opacity: 0, transform: "none" };

  // spring近似（easeOutCubic）
  const progress = Math.min(1, elapsed / Math.max(duration, 0.01));
  const p = 1 - Math.pow(1 - progress, 3);

  switch (type) {
    case "fadeIn":
      return { opacity: p, transform: "none" };
    case "scaleIn":
      return { opacity: p, transform: `scale(${0.3 + 0.7 * p})` };
    case "slideInLeft":
      return { opacity: p, transform: `translateX(${-60 * (1 - p)}px)` };
    case "slideInRight":
      return { opacity: p, transform: `translateX(${60 * (1 - p)}px)` };
    case "slideInBottom":
      return { opacity: p, transform: `translateY(${40 * (1 - p)}px)` };
    case "wobble":
      return { opacity: 1, transform: `rotate(${Math.sin(currentTime * 4) * 3}deg)` };
    default:
      return { opacity: p, transform: "none" };
  }
}

/** ラベルごとの枠色（編集モード用） */
function getLabelColor(label: string): string {
  const colors: Record<string, string> = {
    COVER_TITLE: "#dc2626", SLIDE_TITLE: "#dc2626",
    BODY_PARAGRAPH: "#2563eb",
    LIST_NUMBER: "#7c3aed", LIST_HEADING: "#7c3aed", LIST_BODY: "#7c3aed",
    BOTTOM_TAKEAWAY: "#059669",
    CONTENT_ICON: "#d97706", BOTTOM_TAKEAWAY_ICON: "#d97706",
    PAGE_NUMBER: "#6b7280", SOURCE_CITATION: "#6b7280",
    LOGO: "#0891b2", CHART_IMAGE: "#0891b2",
  };
  return colors[label] || "#6b7280";
}

/** テキスト要素の描画（Remotion TextElement準拠） */
function renderTextElement(el: SlideElement) {
  return (
    <span style={{
      fontSize: (el.fontSize ?? 16) * FONT_SCALE,
      color: el.fontColor ?? "#333333",
      fontWeight: el.fontWeight === "bold" ? 700 : 400,
      lineHeight: el.lineHeight ?? 1.4,
      fontFamily: FONT_FAMILY,
      whiteSpace: "pre-wrap",
      display: "block",
      width: "100%",
    }}>
      {el.text}
    </span>
  );
}

/** リッチテキスト要素の描画（Remotion RichTextElement準拠） */
function renderRichTextElement(el: SlideElement) {
  return (
    <span style={{
      fontSize: (el.fontSize ?? 16) * FONT_SCALE,
      lineHeight: el.lineHeight ?? 1.4,
      fontFamily: FONT_FAMILY,
      whiteSpace: "pre-wrap",
      display: "block",
      width: "100%",
    }}>
      {el.spans?.map((span, i) =>
        span.text === "\n" ? (
          <br key={i} />
        ) : (
          <span key={i} style={{
            color: span.color ?? el.fontColor ?? "#333333",
            fontWeight: span.bold ? 700 : 400,
          }}>
            {span.text}
          </span>
        )
      )}
    </span>
  );
}

/** アイコン要素の描画（Remotion IconElement準拠） */
function renderIconElement(el: SlideElement) {
  if (!el.iconSrc) {
    return (
      <div style={{
        width: "100%", height: "100%",
        background: "#eee", borderRadius: "50%",
      }} />
    );
  }
  const src = el.iconSrc.startsWith("blob:") || el.iconSrc.startsWith("data:")
    ? el.iconSrc
    : `/${el.iconSrc}`;
  return (
    <img
      src={src}
      alt={el.label}
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  );
}

/** LIST_NUMBER要素の描画（Remotion AnimatedElement準拠） */
function renderListNumber(el: SlideElement) {
  return (
    <span style={{
      fontSize: el.h * 0.55,
      color: "#FFFFFF",
      fontWeight: 700,
      fontFamily: FONT_FAMILY,
      lineHeight: 1,
      textAlign: "center",
    }}>
      {el.text}
    </span>
  );
}

const SlidePreview = forwardRef<SlidePreviewHandle, Props>(function SlidePreview(
  { slide, currentTime, selectedElementId, editMode, onSelectElement },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const [scale, setScale] = useState(0.4);

  // 背景画像：LIST_NUMBERの四角を背景から消した加工済み画像を生成
  const bgSrc = slide.background.src;
  const bgUrl = bgSrc.startsWith("data:") || bgSrc.startsWith("blob:") ? bgSrc : `/${bgSrc}`;
  const listNumberElements = useMemo(
    () => slide.elements.filter((el) => el.label === "LIST_NUMBER"),
    [slide.elements]
  );
  const [cleanBgUrl, setCleanBgUrl] = useState<string | null>(null);

  // cleanBgUrl の変化を ref に反映
  readyRef.current = cleanBgUrl !== null;

  useImperativeHandle(ref, () => ({
    getCanvasEl: () => canvasRef.current,
    isReady: () => readyRef.current,
  }));

  const updateScale = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / SLIDE_W;
    const scaleY = rect.height / SLIDE_H;
    setScale(Math.min(scaleX, scaleY));
  }, []);

  useEffect(() => {
    updateScale();
    const obs = new ResizeObserver(updateScale);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [updateScale]);

  useEffect(() => {
    // スライド変更時に「未準備」にリセット
    setCleanBgUrl(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (listNumberElements.length === 0) {
        // LIST_NUMBERがないスライドはそのまま使う
        setCleanBgUrl(bgUrl);
        return;
      }

      // Canvasで背景画像を加工：LIST_NUMBER位置を周囲の色で塗りつぶす
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const sx = img.naturalWidth / SLIDE_W;
      const sy = img.naturalHeight / SLIDE_H;

      for (const el of listNumberElements) {
        // 四角の左隣の色をサンプリング
        const sampleX = Math.max(0, Math.round((el.x - 10) * sx));
        const sampleY = Math.round((el.y + el.h / 2) * sy);
        const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;

        // その色でLIST_NUMBER領域を塗りつぶし（少し大きめに）
        ctx.fillStyle = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
        const pad = 4;
        ctx.fillRect(
          Math.round(el.x * sx) - pad,
          Math.round(el.y * sy) - pad,
          Math.round(el.w * sx) + pad * 2,
          Math.round(el.h * sy) + pad * 2
        );
      }

      setCleanBgUrl(canvas.toDataURL("image/png"));
    };
    img.onerror = () => setCleanBgUrl(bgUrl);
    img.src = bgUrl;
  }, [bgUrl, listNumberElements]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* 1920x1080 キャンバス */}
      <div
        ref={canvasRef}
        style={{
          position: "relative",
          width: SLIDE_W,
          height: SLIDE_H,
          flexShrink: 0,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          backgroundColor: "#FFFFFF",
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        }}
      >
        {/* 背景画像（LIST_NUMBER四角を除去済み） */}
        {cleanBgUrl && (
          <img
            src={cleanBgUrl}
            alt=""
            style={{
              position: "absolute",
              top: 0, left: 0,
              width: "100%", height: "100%",
            }}
          />
        )}

        {/* 各要素（Remotion AnimatedElement準拠） */}
        {slide.elements.map((el) => {
          const { opacity, transform } = getAnimationStyle(el, currentTime);
          const isSelected = el.id === selectedElementId;
          const isListNumber = el.label === "LIST_NUMBER";
          const labelColor = getLabelColor(el.label);

          // アニメーション開始前の要素はDOMから完全に除外
          if (currentTime < el.animation.delay) return null;

          return (
            <div
              key={el.id}
              onClick={(e) => { e.stopPropagation(); onSelectElement(el.id); }}
              style={{
                position: "absolute",
                left: el.x,
                top: el.y,
                width: el.w,
                height: el.h,
                opacity,
                transform,
                display: "flex",
                alignItems: "center",
                justifyContent: isListNumber ? "center" : "flex-start",
                cursor: "pointer",
                // LIST_NUMBER: 四角＋数字を一体描画（PPTX準拠色）
                // その他の要素: bgColorがあれば背景色を適用
                ...(isListNumber ? {
                  backgroundColor: el.bgColor ?? "#4ecdd3",
                  borderRadius: 8,
                } : el.bgColor ? {
                  backgroundColor: el.bgColor,
                } : {}),
                // 編集モードの枠
                ...(editMode ? {
                  outline: isSelected ? `3px solid ${labelColor}` : `1px dashed ${labelColor}44`,
                  outlineOffset: isSelected ? 2 : 0,
                } : {}),
              }}
            >
              {/* 編集モード：選択時ラベル表示 */}
              {editMode && isSelected && (
                <div style={{
                  position: "absolute", top: -22, left: 0,
                  fontSize: 11, padding: "2px 6px", borderRadius: 3,
                  background: labelColor, color: "white",
                  whiteSpace: "nowrap", lineHeight: 1.2, zIndex: 10,
                }}>
                  {labelJa(el.label)}
                </div>
              )}

              {/* 要素の描画 */}
              {isListNumber
                ? renderListNumber(el)
                : el.type === "richText" && el.spans
                  ? renderRichTextElement(el)
                  : el.type === "icon"
                    ? renderIconElement(el)
                    : renderTextElement(el)
              }
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default SlidePreview;