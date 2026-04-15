import React from "react";
import { Img, staticFile } from "remotion";
import type { SlideElement } from "../types";

export const IconElement: React.FC<{ element: SlideElement }> = ({ element }) => {
    if (!element.iconSrc) {
        return (
            <div style={{
                width: "100%",
                height: "100%",
                background: "#eee",
                borderRadius: "50%",
            }} />
        );
    }
    return (
        <Img
            src={staticFile(element.iconSrc)}
            style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
            }}
        />
    );
};
