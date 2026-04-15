export type AnimationType =
    | "fadeIn"
    | "scaleIn"
    | "slideInLeft"
    | "slideInRight"
    | "slideInBottom";

export type SlideType = "cover" | "paragraph" | "list" | "end";

export type ElementLabel =
    | "COVER_TITLE" | "SLIDE_TITLE" | "BODY_PARAGRAPH"
    | "LIST_NUMBER" | "LIST_HEADING" | "LIST_BODY"
    | "SOURCE_CITATION" | "BOTTOM_TAKEAWAY" | "PAGE_NUMBER"
    | "CONTENT_ICON" | "BOTTOM_TAKEAWAY_ICON"
    | "LOGO" | "CHART_IMAGE";

export interface Animation {
    type: AnimationType;
    delay: number;
    duration: number;
}

export interface TextSpan {
    text: string;
    color?: string;
    bold?: boolean;
}

export interface SlideElement {
    id: string;
    label: ElementLabel;
    type: "text" | "richText" | "icon" | "image";
    x: number;
    y: number;
    w: number;
    h: number;
    text?: string;
    spans?: TextSpan[];
    fontSize?: number;
    fontColor?: string;
    fontWeight?: "normal" | "bold";
    lineHeight?: number;
    iconSrc?: string;
    imageSrc?: string;
    animation: Animation;
}

export interface SlideAudio {
    src: string;
    duration_sec: number;
    offset_sec: number;
}

export interface Slide {
    slide_index: number;
    slide_type: SlideType;
    duration: number;
    background: { src: string };
    audio?: SlideAudio | null;
    elements: SlideElement[];
}

export interface SlidesData {
    meta: {
        source_file: string;
        total_slides: number;
        output_width: number;
        output_height: number;
        fps: number;
    };
    slides: Slide[];
}
