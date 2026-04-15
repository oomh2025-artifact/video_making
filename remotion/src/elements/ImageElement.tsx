import React from "react";
import { Img, staticFile } from "remotion";
import type { SlideElement } from "../types";

export const ImageElement: React.FC<{ element: SlideElement }> = ({ element }) => {
    if (!element.imageSrc) {
        return (
            <div style={{
                width: "100%",
                height: "100%",
                background: "#f0f0f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}>
                <span style={{ color: "#999" }}>Image</span>
            </div>
        );
    }
    return (
        <Img
            src={staticFile(element.imageSrc)}
            style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
            }}
        />
    );
};
