import { Composition, registerRoot } from "remotion";
import { SlideShow } from "./SlideShow";
import slidesData from "../../data/slides.json";
import "./fonts";

const RemotionRoot: React.FC = () => {
    const data = slidesData as any;
    const fps = data.meta.fps;
    const totalDuration = data.slides.reduce(
        (sum: number, s: any) => sum + s.duration, 0
    );

    return (
        <Composition
            id="SlideShow"
            component={SlideShow}
            durationInFrames={Math.ceil(totalDuration * fps)}
            fps={fps}
            width={data.meta.output_width}
            height={data.meta.output_height}
            defaultProps={{ data }}
        />
    );
};

registerRoot(RemotionRoot);