import React from "react";
import type { SlideElement } from "../types";

const FONT_SCALE = 2.0;

export const RichTextElement: React.FC<{ element: SlideElement }> = ({ element }) => (
    <span style={{
        fontSize: (element.fontSize ?? 16) * FONT_SCALE,
        lineHeight: element.lineHeight ?? 1.4,
        fontFamily: "'Meiryo', 'メイリオ', 'Noto Sans JP', sans-serif",
        whiteSpace: "pre-wrap",
        display: "block",
        width: "100%",
    }}>
        {element.spans?.map((span, i) =>
            span.text === "\n" ? (
                <br key={i} />
            ) : (
                <span key={i} style={{
                    color: span.color ?? element.fontColor ?? "#333333",
                    fontWeight: span.bold ? 700 : 400,
                }}>
                    {span.text}
                </span>
            )
        )}
    </span>
);
