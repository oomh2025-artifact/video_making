// remotion/src/types.ts と完全互換の型定義
export type AnimationType =
  | "fadeIn"
  | "scaleIn"
  | "slideInLeft"
  | "slideInRight"
  | "slideInBottom"
  | "wobble";
export type SlideType = "cover" | "paragraph" | "list" | "end";
export type ElementLabel =
  | "COVER_TITLE" | "SLIDE_TITLE" | "BODY_PARAGRAPH"
  | "LIST_NUMBER" | "LIST_HEADING" | "LIST_BODY"
  | "SOURCE_CITATION" | "BOTTOM_TAKEAWAY" | "PAGE_NUMBER"
  | "CONTENT_ICON" | "BOTTOM_TAKEAWAY_ICON"
  | "LOGO" | "CHART_IMAGE";
// 背景層ラベル（slides.jsonには含めない）
export type BackgroundLabel =
  | "BG_FILL" | "HEADER_STRIPE" | "FOOTER_STRIPE"
  | "TITLE_LINE" | "BOTTOM_BAR" | "LIST_DIVIDER"
  | "CONTENT_AREA_BG" | "ACCENT_SHAPE";
export type AnyLabel = ElementLabel | BackgroundLabel;

// テキスト揃え
export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

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
  bgColor?: string;
  fontWeight?: "normal" | "bold";
  lineHeight?: number;
  textAlign?: HorizontalAlign;       // PPTX <a:pPr algn=".."/> から
  verticalAlign?: VerticalAlign;     // PPTX <a:bodyPr anchor=".."/> から
  iconSrc?: string;
  imageSrc?: string;
  animation: Animation;
}
export interface SlideAudio {
  src: string;
  duration_sec: number;
  offset_sec: number;
}
export interface BackgroundShape {
  x: number;
  y: number;
  w: number;
  h: number;
  fillColor?: string;
  imageSrc?: string;
}
export interface Slide {
  slide_index: number;
  slide_type: SlideType;
  duration: number;
  background: { src: string };
  backgroundShapes?: BackgroundShape[];
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
// PPTXパーサーの中間データ型
export interface TextRun {
  text: string;
  font_size_pt: number | null;
  font_color: string | null;
  bold: boolean;
  italic: boolean;
  font_name: string | null;
}
export interface RawShape {
  slide_index: number;
  shape_id: number;
  name: string;
  shape_type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  left_emu: number;
  top_emu: number;
  width_emu: number;
  height_emu: number;
  rotation: number;
  has_text: boolean;
  text: string | null;
  text_runs: TextRun[] | null;
  text_align: HorizontalAlign | null;     // 段落の水平揃え（最初の段落基準）
  vertical_align: VerticalAlign | null;   // テキストフレームの垂直揃え
  fill_color: string | null;
  line_color: string | null;
  line_width_pt: number | null;
  is_picture: boolean;
  image_content_type: string | null;
  image_filename: string | null;
  imageBlobUrl?: string;
  embedId?: string;
}
export interface RawSlide {
  slide_index: number;
  shapes: RawShape[];
}
export interface RawShapesData {
  source_file: string;
  slide_width_emu: number;
  slide_height_emu: number;
  output_width: number;
  output_height: number;
  slides: RawSlide[];
}
