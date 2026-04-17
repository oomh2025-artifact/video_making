import { useState } from "react";
import type { SlideElement, AnimationType, Slide } from "../types/slides";
import { labelJa, animJa } from "../lib/labelNames";

interface Props {
  slide: Slide;
  selectedElement: SlideElement | null;
  onUpdateElement: (elementId: string, updates: Partial<SlideElement>) => void;
  onDeleteElement: (elementId: string) => void;
  onSelectElement: (id: string) => void;
}

const ANIM_TYPES: AnimationType[] = ["fadeIn", "scaleIn", "slideInLeft", "slideInRight", "slideInBottom", "wobble"];

export default function PropertyPanel({ slide, selectedElement, onUpdateElement, onDeleteElement, onSelectElement }: Props) {
  const [editingText, setEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startEditText = () => {
    if (!selectedElement) return;
    setTextDraft(selectedElement.text || "");
    setEditingText(true);
  };

  const saveText = () => {
    if (!selectedElement) return;
    onUpdateElement(selectedElement.id, { text: textDraft });
    setEditingText(false);
  };

  const cancelEdit = () => {
    setEditingText(false);
  };

  const handleDelete = () => {
    if (!selectedElement) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDeleteElement(selectedElement.id);
    setConfirmDelete(false);
  };

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

            {/* テキスト表示 or 編集 */}
            {selectedElement.text && (
              <div className="prop-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                <span className="prop-label">テキスト</span>
                {editingText ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <textarea
                      value={textDraft}
                      onChange={(e) => setTextDraft(e.target.value)}
                      style={{
                        width: "100%",
                        minHeight: 60,
                        fontSize: 12,
                        padding: 4,
                        border: "1px solid #ccc",
                        borderRadius: 4,
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={saveText}
                        style={{
                          flex: 1,
                          padding: "4px 8px",
                          fontSize: 12,
                          background: "#2563eb",
                          color: "#fff",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                      >
                        保存
                      </button>
                      <button
                        onClick={cancelEdit}
                        style={{
                          flex: 1,
                          padding: "4px 8px",
                          fontSize: 12,
                          background: "#e5e7eb",
                          color: "#333",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <span
                    className="prop-value"
                    style={{ fontSize: 12, wordBreak: "break-all", cursor: "pointer" }}
                    onClick={startEditText}
                    title="クリックで編集"
                  >
                    {selectedElement.text.slice(0, 40)}{selectedElement.text.length > 40 ? "..." : ""}
                    <span style={{ color: "#2563eb", fontSize: 10, marginLeft: 4 }}>✏️</span>
                  </span>
                )}
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
                <input
                  type="number"
                  min={0}
                  max={Math.max(slide.duration, 10)}
                  step={0.1}
                  value={selectedElement.animation.delay}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) onUpdateElement(selectedElement.id, {
                      animation: { ...selectedElement.animation, delay: v },
                    });
                  }}
                  style={{ width: 52, fontSize: 12, padding: "2px 4px", border: "1px solid #ccc", borderRadius: 4, textAlign: "right" }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>秒</span>
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
                <input
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={selectedElement.animation.duration}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) onUpdateElement(selectedElement.id, {
                      animation: { ...selectedElement.animation, duration: v },
                    });
                  }}
                  style={{ width: 52, fontSize: 12, padding: "2px 4px", border: "1px solid #ccc", borderRadius: 4, textAlign: "right" }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>秒</span>
              </div>
            </div>
          </div>

          {/* 削除ボタン */}
          <div className="prop-section" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
            <button
              onClick={handleDelete}
              onMouseLeave={() => setConfirmDelete(false)}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 13,
                background: confirmDelete ? "#dc2626" : "#fee2e2",
                color: confirmDelete ? "#fff" : "#dc2626",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
                transition: "all 0.15s",
              }}
            >
              {confirmDelete ? "本当に削除しますか？" : "この要素を削除"}
            </button>
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
