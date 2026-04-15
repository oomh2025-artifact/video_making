import React from "react";
import { Sequence, Audio, staticFile } from "remotion";
import { SlideRenderer } from "./SlideRenderer";
import type { SlidesData } from "./types";

export const SlideShow: React.FC<{ data: SlidesData }> = ({ data }) => {
    const fps = data.meta.fps;
    let currentFrame = 0;

    return (
        <>
            {data.slides.map((slide) => {
                const durationFrames = Math.ceil(slide.duration * fps);
                const fromFrame = currentFrame;
                currentFrame += durationFrames;

                return (
                    <Sequence
                        key={slide.slide_index}
                        from={fromFrame}
                        durationInFrames={durationFrames}
                    >
                        <SlideRenderer slide={slide} fps={fps} />
                        {slide.audio && slide.audio.src && (
                            <Sequence from={Math.round((slide.audio.offset_sec ?? 0.5) * fps)}>
                                <Audio
                                    src={staticFile(slide.audio.src)}
                                    volume={1}
                                />
                            </Sequence>
                        )}
                    </Sequence>
                );
            })}
        </>
    );
};
