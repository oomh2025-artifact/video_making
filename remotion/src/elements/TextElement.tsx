import React from "react";
import type { SlideElement } from "../types";

const FONT_SCALE = 2.0;

export const TextElement: React.FC<{ element: SlideElement }> = ({ element }) => (
    <span style={{
        fontSize: (element.fontSize ?? 16) * FONT_SCALE,
        color: element.fontColor ?? "#333333",
        fontWeight: element.fontWeight === "bold" ? 700 : 400,
        lineHeight: element.lineHeight ?? 1.4,
        fontFamily: "'Meiryo', 'メイリオ', 'Noto Sans JP', sans-serif",
        whiteSpace: "pre-wrap",
        display: "block",
        width: "100%",
    }}>
        {element.text}
    </span>
);
