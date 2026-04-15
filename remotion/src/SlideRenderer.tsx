import React from "react";
import { Img, staticFile } from "remotion";
import { AnimatedElement } from "./AnimatedElement";
import type { Slide } from "./types";

export const SlideRenderer: React.FC<{ slide: Slide; fps: number }> = ({ slide, fps }) => {
    return (
        <div style={{
            width: "100%",
            height: "100%",
            position: "relative",
            backgroundColor: "#FFFFFF",
        }}>
            {/* L1: 背景画像 */}
            <Img
                src={staticFile(slide.background.src)}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                }}
            />

            {/* L2+L3: アニメーション要素 */}
            {slide.elements.map((el) => (
                <AnimatedElement key={el.id} element={el} fps={fps} />
            ))}
        </div>
    );
};
