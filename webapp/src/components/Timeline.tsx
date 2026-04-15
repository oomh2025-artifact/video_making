import type { SlideElement } from "../types/slides";
import { labelJa } from "../lib/labelNames";

interface Props {
  elements: SlideElement[];
  duration: number;
  currentTime: number;
  selectedElementId: string | null;
  onSelectElement: (id: string) => void;
}

export default function Timeline({ elements, duration, currentTime, selectedElementId, onSelectElement }: Props) {
  if (duration <= 0) return null;

  return (
    <div className="timeline">
      {elements.map((el) => {
        const startPct = (el.animation.delay / duration) * 100;
        const widthPct = (el.animation.duration / duration) * 100;
        const playheadPct = (currentTime / duration) * 100;

        return (
          <div
            key={el.id}
            className={`timeline-row ${el.id === selectedElementId ? "selected" : ""}`}
            onClick={() => onSelectElement(el.id)}
          >
            <span className={`timeline-label label-${el.label}`}>{labelJa(el.label)}</span>
            <div className="timeline-track">
              <div
                className={`timeline-bar bar-${el.label}`}
                style={{ left: `${startPct}%`, width: `${Math.max(widthPct, 1)}%` }}
              />
              <div className="timeline-playhead" style={{ left: `${playheadPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
