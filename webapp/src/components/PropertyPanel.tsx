import type { SlideElement, AnimationType, Slide } from "../types/slides";
import { labelJa, animJa } from "../lib/labelNames";

interface Props {
  slide: Slide;
  selectedElement: SlideElement | null;
  onUpdateElement: (elementId: string, updates: Partial<SlideElement>) => void;
  onSelectElement: (id: string) => void;
}

const ANIM_TYPES: AnimationType[] = ["fadeIn", "scaleIn", "slideInLeft", "slideInRight", "slideInBottom", "wobble"];

export default function PropertyPanel({ slide, selectedElement, onUpdateElement, onSelectElement }: Props) {
  return (
    <div className="property-panel">
      {selectedElement ? (
        <>
          <div className="prop-section">
            <h3>要素プロパティ</h3>
            <div className="prop-row">
              <span className="prop-label">ラベル</span>
              <span className={`prop-value label-${selectedElement.label}`}>{labelJa(selectedElement.label)}</span>
            </div>
            {selectedElement.text && (
              <div className="prop-row">
                <span className="prop-label">テキスト</span>
                <span className="prop-value" style={{ fontSize: 12, wordBreak: "break-all" }}>
                  {selectedElement.text.slice(0, 40)}{selectedElement.text.length > 40 ? "..." : ""}
                </span>
              </div>
            )}
            <div className="prop-row">
              <span className="prop-label">位置</span>
              <span className="prop-value" style={{ fontSize: 12 }}>
                X:{selectedElement.x} Y:{selectedElement.y} W:{selectedElement.w} H:{selectedElement.h}
              </span>
            </div>
          </div>

          <div className="prop-section">
            <h3>アニメーション</h3>
            <div className="anim-options">
              {ANIM_TYPES.map((t) => (
                <button
                  key={t}
                  className={`anim-option ${selectedElement.animation.type === t ? "active" : ""}`}
                  onClick={() =>
                    onUpdateElement(selectedElement.id, {
                      animation: { ...selectedElement.animation, type: t },
                    })
                  }
                >
                  {animJa(t)}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="prop-row">
                <span className="prop-label">遅延</span>
                <input
                  type="range"
                  className="prop-slider"
                  min={0}
                  max={Math.max(slide.duration, 10)}
                  step={0.1}
                  value={selectedElement.animation.delay}
                  onChange={(e) =>
                    onUpdateElement(selectedElement.id, {
                      animation: { ...selectedElement.animation, delay: parseFloat(e.target.value) },
                    })
                  }
                />
                <span className="prop-slider-value">{selectedElement.animation.delay.toFixed(1)}秒</span>
              </div>

              <div className="prop-row">
                <span className="prop-label">速度</span>
                <input
                  type="range"
                  className="prop-slider"
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={selectedElement.animation.duration}
                  onChange={(e) =>
                    onUpdateElement(selectedElement.id, {
                      animation: { ...selectedElement.animation, duration: parseFloat(e.target.value) },
                    })
                  }
                />
                <span className="prop-slider-value">{selectedElement.animation.duration.toFixed(1)}秒</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="prop-section">
          <h3>要素プロパティ</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            要素を選択してください
          </p>
        </div>
      )}

      {/* 要素一覧 */}
      <div className="element-list">
        <h3 style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: 8 }}>
          要素一覧 ({slide.elements.length})
        </h3>
        {slide.elements.map((el) => (
          <div
            key={el.id}
            className={`element-item ${el.id === selectedElement?.id ? "selected" : ""}`}
            onClick={() => onSelectElement(el.id)}
          >
            <div className={`element-dot dot-${el.label}`} />
            <span>{labelJa(el.label)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}