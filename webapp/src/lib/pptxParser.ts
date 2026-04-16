/**
 * PPTXパーサー: JSZip + DOMParser でPPTXからシェイプ情報を抽出
 * Python版 extract_shapes.py のTypeScript移植
 */
import JSZip from "jszip";
import type { RawShape, RawSlide, RawShapesData, TextRun } from "../types/slides";

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

function emuToPx(emu: number, slideDimEmu: number, outputDim: number): number {
  if (slideDimEmu === 0) return 0;
  return Math.round((emu / slideDimEmu) * outputDim);
}

/** 子要素をlocalNameで検索（名前空間問わず） */
function findChild(el: Element, localName: string): Element | null {
  for (const c of Array.from(el.children)) {
    if (c.localName === localName) return c;
  }
  return null;
}

/** 子要素をlocalNameで全検索（名前空間問わず） */
function findChildren(el: Element, localName: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === localName);
}

/** 再帰的にlocalNameで全検索 */
function findAll(el: Element, localName: string): Element[] {
  const results: Element[] = [];
  for (const c of Array.from(el.children)) {
    if (c.localName === localName) results.push(c);
    results.push(...findAll(c, localName));
  }
  return results;
}

/** srgbClr要素から色を取得 */
function extractColor(el: Element | null): string | null {
  if (!el) return null;
  const srgb = findAll(el, "srgbClr")[0];
  if (srgb) {
    const val = srgb.getAttribute("val");
    if (val) return `#${val}`;
  }
  return null;
}

/** テキストrunの情報を抽出 */
function extractTextRuns(txBody: Element): TextRun[] {
  const runs: TextRun[] = [];
  const paragraphs = findChildren(txBody, "p");

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    const aRuns = findChildren(para, "r");

    for (const aRun of aRuns) {
      const rPr = findChild(aRun, "rPr");
      const tEl = findChild(aRun, "t");
      const text = tEl?.textContent || "";

      let fontSizePt: number | null = null;
      if (rPr) {
        const sz = rPr.getAttribute("sz");
        if (sz) fontSizePt = Math.round((parseInt(sz, 10) / 100) * 10) / 10;
      }

      const bold = rPr?.getAttribute("b") === "1";
      const italic = rPr?.getAttribute("i") === "1";

      let fontColor: string | null = null;
      if (rPr) {
        const solidFill = findChild(rPr, "solidFill");
        fontColor = extractColor(solidFill);
      }

      let fontName: string | null = null;
      if (rPr) {
        const latin = findChild(rPr, "latin");
        if (latin) fontName = latin.getAttribute("typeface");
      }

      runs.push({ text, font_size_pt: fontSizePt, font_color: fontColor, bold, italic, font_name: fontName });
    }

    // 段落間の改行（最後の段落以外）
    if (pIdx < paragraphs.length - 1) {
      runs.push({ text: "\n", font_size_pt: null, font_color: null, bold: false, italic: false, font_name: null });
    }
  }

  // フォントサイズがnullの場合、最頻サイズを適用
  const sizeCounts: Record<number, number> = {};
  for (const r of runs) {
    if (r.font_size_pt !== null) {
      sizeCounts[r.font_size_pt] = (sizeCounts[r.font_size_pt] || 0) + 1;
    }
  }
  const entries = Object.entries(sizeCounts);
  if (entries.length > 0) {
    const mostCommon = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const mostCommonSize = parseFloat(mostCommon[0]);
    for (const r of runs) {
      if (r.font_size_pt === null && r.text !== "\n") {
        r.font_size_pt = mostCommonSize;
      }
    }
  }

  return runs;
}

/** xfrm要素から座標情報を取得 */
function getTransform(parent: Element | null): { offX: number; offY: number; extCx: number; extCy: number } | null {
  if (!parent) return null;
  const xfrm = findChild(parent, "xfrm");
  if (!xfrm) return null;
  const off = findChild(xfrm, "off");
  const ext = findChild(xfrm, "ext");
  if (!off || !ext) return null;
  return {
    offX: parseInt(off.getAttribute("x") || "0", 10),
    offY: parseInt(off.getAttribute("y") || "0", 10),
    extCx: parseInt(ext.getAttribute("cx") || "0", 10),
    extCy: parseInt(ext.getAttribute("cy") || "0", 10),
  };
}

/** 単一シェイプを抽出 */
function extractSingleShape(
  sp: Element,
  slideIndex: number,
  swEmu: number,
  shEmu: number,
  isPicture: boolean,
  offsetLeftEmu: number = 0,
  offsetTopEmu: number = 0
): RawShape | null {
  // spPr を検索
  const spPr = findChild(sp, "spPr");
  const transform = getTransform(spPr);
  if (!transform) return null;

  const leftEmu = transform.offX + offsetLeftEmu;
  const topEmu = transform.offY + offsetTopEmu;
  const widthEmu = transform.extCx;
  const heightEmu = transform.extCy;

  // 名前とIDを取得
  const nvSpPr = findChild(sp, "nvSpPr") || findChild(sp, "nvPicPr") || findChild(sp, "nvGrpSpPr");
  let shapeName = "Shape";
  let shapeId = 0;
  if (nvSpPr) {
    const cNvPr = findChild(nvSpPr, "cNvPr");
    if (cNvPr) {
      shapeName = cNvPr.getAttribute("name") || "Shape";
      shapeId = parseInt(cNvPr.getAttribute("id") || "0", 10);
    }
  }

  // テキスト抽出
  const txBody = findChild(sp, "txBody");
  let hasText = false;
  let text: string | null = null;
  let textRuns: TextRun[] | null = null;

  if (txBody) {
    const runs = extractTextRuns(txBody);
    const rawText = runs.map((r) => r.text).join("");
    if (rawText.trim()) {
      hasText = true;
      text = rawText;
      textRuns = runs;
    }
  }

  // 塗りつぶし色取得
  let fillColor: string | null = null;
  if (spPr) {
    const solidFill = findChild(spPr, "solidFill");
    fillColor = extractColor(solidFill);
  }

  // 画像ファイル名とembedId
  let imageFilename: string | null = null;
  let imageContentType: string | null = null;
  let embedId: string | undefined;
  if (isPicture) {
    imageContentType = "image/png";
    const safeName = shapeName.replace(/\s+/g, "_");
    imageFilename = `slide_${String(slideIndex + 1).padStart(2, "0")}_${safeName}.png`;

    // blipFill > blip の r:embed を取得（画像抽出用）
    const blipFill = findChild(sp, "blipFill");
    if (blipFill) {
      const blip = findChild(blipFill, "blip");
      if (blip) {
        // 名前空間プレフィックスに依存しない取得方法
        for (const attr of Array.from(blip.attributes)) {
          if (attr.localName === "embed") {
            embedId = attr.value;
            break;
          }
        }
      }
    }
  }

  return {
    slide_index: slideIndex,
    shape_id: shapeId,
    name: shapeName,
    shape_type: isPicture ? "PICTURE" : "AUTO_SHAPE",
    x: emuToPx(leftEmu, swEmu, OUTPUT_WIDTH),
    y: emuToPx(topEmu, shEmu, OUTPUT_HEIGHT),
    w: emuToPx(widthEmu, swEmu, OUTPUT_WIDTH),
    h: emuToPx(heightEmu, shEmu, OUTPUT_HEIGHT),
    left_emu: leftEmu,
    top_emu: topEmu,
    width_emu: widthEmu,
    height_emu: heightEmu,
    rotation: 0,
    has_text: hasText,
    text,
    text_runs: textRuns,
    fill_color: fillColor,
    line_color: null,
    line_width_pt: null,
    is_picture: isPicture,
    image_content_type: imageContentType,
    image_filename: imageFilename,
    imageBlobUrl: undefined,
    embedId,
  };
}

/** 要素ツリーからsp/pic/grpSpを再帰的に抽出 */
function extractShapesFromTree(
  parent: Element,
  slideIndex: number,
  swEmu: number,
  shEmu: number,
  offsetLeftEmu: number = 0,
  offsetTopEmu: number = 0
): RawShape[] {
  const shapes: RawShape[] = [];

  for (const child of Array.from(parent.children)) {
    const tag = child.localName;

    if (tag === "sp") {
      const shape = extractSingleShape(child, slideIndex, swEmu, shEmu, false, offsetLeftEmu, offsetTopEmu);
      if (shape) shapes.push(shape);
    } else if (tag === "pic") {
      const shape = extractSingleShape(child, slideIndex, swEmu, shEmu, true, offsetLeftEmu, offsetTopEmu);
      if (shape) shapes.push(shape);
    } else if (tag === "grpSp") {
      // グループシェイプの座標を計算
      const grpSpPr = findChild(child, "grpSpPr");
      let grpOffX = 0, grpOffY = 0;
      let chOffX = 0, chOffY = 0;
      if (grpSpPr) {
        const xfrm = findChild(grpSpPr, "xfrm");
        if (xfrm) {
          const off = findChild(xfrm, "off");
          const chOff = findChild(xfrm, "chOff");
          if (off) {
            grpOffX = parseInt(off.getAttribute("x") || "0", 10);
            grpOffY = parseInt(off.getAttribute("y") || "0", 10);
          }
          if (chOff) {
            chOffX = parseInt(chOff.getAttribute("x") || "0", 10);
            chOffY = parseInt(chOff.getAttribute("y") || "0", 10);
          }
        }
      }

      // 子要素のオフセット = (grpOff - chOff) + parentOffset
      const newOffX = grpOffX - chOffX + offsetLeftEmu;
      const newOffY = grpOffY - chOffY + offsetTopEmu;

      // 再帰的に子要素を処理
      shapes.push(...extractShapesFromTree(child, slideIndex, swEmu, shEmu, newOffX, newOffY));
    }
  }

  return shapes;
}

/** スライドXMLからシェイプを抽出 */
function extractShapesFromSlideXml(
  xmlDoc: Document,
  slideIndex: number,
  swEmu: number,
  shEmu: number
): RawShape[] {
  // spTree を名前空間問わず検索
  const allElements = xmlDoc.getElementsByTagName("*");
  let spTree: Element | null = null;
  for (let i = 0; i < allElements.length; i++) {
    if (allElements[i].localName === "spTree") {
      spTree = allElements[i];
      break;
    }
  }
  if (!spTree) return [];

  return extractShapesFromTree(spTree, slideIndex, swEmu, shEmu);
}

/** .relsファイルをパースして embedId → Target のマップを返す */
function parseSlideRels(relsXml: string): Map<string, string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(relsXml, "application/xml");
  const map = new Map<string, string>();
  const rels = doc.getElementsByTagName("Relationship");
  for (let i = 0; i < rels.length; i++) {
    const rel = rels[i];
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

/** PPTXファイルをパースしてRawShapesDataを返す */
export async function parsePptx(file: File): Promise<RawShapesData> {
  const zip = await JSZip.loadAsync(file);

  // スライドサイズ取得
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presentationXml) throw new Error("ppt/presentation.xml が見つかりません");

  const parser = new DOMParser();
  const presDoc = parser.parseFromString(presentationXml, "application/xml");

  // sldSz を名前空間問わず検索
  const allEls = presDoc.getElementsByTagName("*");
  let swEmu = 9144000;
  let shEmu = 5143500;
  for (let i = 0; i < allEls.length; i++) {
    if (allEls[i].localName === "sldSz") {
      swEmu = parseInt(allEls[i].getAttribute("cx") || "9144000", 10);
      shEmu = parseInt(allEls[i].getAttribute("cy") || "5143500", 10);
      break;
    }
  }

  // スライドファイル一覧を取得（番号順にソート）
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/)?.[1] || "0", 10);
      const nb = parseInt(b.match(/slide(\d+)/)?.[1] || "0", 10);
      return na - nb;
    });

  const slides: RawSlide[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.file(slideFiles[i])?.async("text");
    if (!slideXml) continue;

    const slideDoc = parser.parseFromString(slideXml, "application/xml");
    const shapes = extractShapesFromSlideXml(slideDoc, i, swEmu, shEmu);

    // .relsファイルからembedIdとメディアファイルの対応を取得
    const slideNum = slideFiles[i].match(/slide(\d+)/)?.[1] || "1";
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const relsXml = await zip.file(relsPath)?.async("text");
    const rels = relsXml ? parseSlideRels(relsXml) : new Map<string, string>();

    // 画像シェイプの実画像をPPTXから抽出してBlobURLを設定
    for (const shape of shapes) {
      if (shape.is_picture && shape.embedId) {
        const target = rels.get(shape.embedId);
        if (target) {
          // ../media/image1.png → ppt/media/image1.png
          const mediaPath = target.startsWith("../")
            ? "ppt/" + target.substring(3)
            : target.startsWith("/")
              ? target.substring(1)
              : "ppt/slides/" + target;
          const imageFile = zip.file(mediaPath);
          if (imageFile) {
            try {
              const blob = await imageFile.async("blob");
              shape.imageBlobUrl = URL.createObjectURL(blob);
            } catch (e) {
              console.warn(`画像抽出失敗: ${mediaPath}`, e);
            }
          }
        }
      }
    }

    slides.push({ slide_index: i, shapes });
  }

  return {
    source_file: file.name,
    slide_width_emu: swEmu,
    slide_height_emu: shEmu,
    output_width: OUTPUT_WIDTH,
    output_height: OUTPUT_HEIGHT,
    slides,
  };
}
