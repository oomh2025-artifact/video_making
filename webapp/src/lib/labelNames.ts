/** ラベルの日本語表示名 */
export const LABEL_NAMES_JA: Record<string, string> = {
  COVER_TITLE: "カバータイトル",
  SLIDE_TITLE: "スライドタイトル",
  BODY_PARAGRAPH: "本文",
  LIST_NUMBER: "リスト番号",
  LIST_HEADING: "リスト見出し",
  LIST_BODY: "リスト本文",
  SOURCE_CITATION: "出典",
  BOTTOM_TAKEAWAY: "まとめ",
  PAGE_NUMBER: "ページ番号",
  CONTENT_ICON: "アイコン",
  BOTTOM_TAKEAWAY_ICON: "まとめアイコン",
  LOGO: "ロゴ",
  CHART_IMAGE: "チャート画像",
};

/** アニメーション種類の日本語表示名 */
export const ANIM_NAMES_JA: Record<string, string> = {
  fadeIn: "フェードイン",
  scaleIn: "スケールイン",
  slideInLeft: "左からスライド",
  slideInRight: "右からスライド",
  slideInBottom: "下からスライド",
};

export function labelJa(label: string): string {
  return LABEL_NAMES_JA[label] || label;
}

export function animJa(anim: string): string {
  return ANIM_NAMES_JA[anim] || anim;
}
