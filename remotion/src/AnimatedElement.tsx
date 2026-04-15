import React from "react";
import { useCurrentFrame, spring, interpolate } from "remotion";
import { TextElement } from "./elements/TextElement";
import { RichTextElement } from "./elements/RichTextElement";
import { IconElement } from "./elements/IconElement";
import { ImageElement } from "./elements/ImageElement";
import type { SlideElement, AnimationType } from "./types";

function useAnimationStyle(
    animType: AnimationType,
    delay: number,
    duration: number,
    fps: number
) {
    const frame = useCurrentFrame();
    const delayFrames = Math.round(delay * fps);
    const adjustedFrame = Math.max(0, frame - delayFrames);

    const progress = spring({
        frame: adjustedFrame,
        fps,
        config: {
            damping: 15,
            stiffness: 120,
            mass: 0.8,
        },
    });

    let opacity: number;
    let transform: string;

    switch (animType) {
        case "fadeIn":
            opacity = progress;
            transform = "none";
            break;
        case "scaleIn":
            opacity = progress;
            transform = `scale(${interpolate(progress, [0, 1], [0.3, 1])})`;
            break;
        case "slideInLeft":
            opacity = progress;
            transform = `translateX(${interpolate(progress, [0, 1], [-60, 0])}px)`;
            break;
        case "slideInRight":
            opacity = progress;
            transform = `translateX(${interpolate(progress, [0, 1], [60, 0])}px)`;
            break;
        case "slideInBottom":
            opacity = progress;
            transform = `translateY(${interpolate(progress, [0, 1], [40, 0])}px)`;
            break;
        default:
            opacity = progress;
            transform = "none";
    }

    return { opacity, transform };
}

export const AnimatedElement: React.FC<{
    element: SlideElement;
    fps: number;
}> = ({ element, fps }) => {
    const { opacity, transform } = useAnimationStyle(
        element.animation.type,
        element.animation.delay,
        element.animation.duration,
        fps
    );

    const isListNumber = element.label === "LIST_NUMBER";

    const containerStyle: React.CSSProperties = {
        position: "absolute",
        left: element.x,
        top: element.y,
        width: element.w,
        height: element.h,
        opacity,
        transform,
        display: "flex",
        alignItems: isListNumber ? "center" : "center",
        justifyContent: isListNumber ? "center" : "flex-start",
    };

    // LIST_NUMBER: white, large, centered
    if (isListNumber) {
        return (
            <div style={containerStyle}>
                <span style={{
                    fontSize: element.h * 0.55,
                    color: "#FFFFFF",
                    fontWeight: 700,
                    fontFamily: "'Meiryo', 'メイリオ', 'Noto Sans JP', sans-serif",
                    lineHeight: 1,
                    textAlign: "center",
                }}>
                    {element.text}
                </span>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            {element.type === "richText" && element.spans ? (
                <RichTextElement element={element} />
            ) : element.type === "icon" ? (
                <IconElement element={element} />
            ) : element.type === "image" ? (
                <ImageElement element={element} />
            ) : (
                <TextElement element={element} />
            )}
        </div>
    );
};
