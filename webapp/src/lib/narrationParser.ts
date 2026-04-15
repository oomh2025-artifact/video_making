/**
 * ナレーション原稿をスライドごとに分割
 * 空行2行以上でスライド区切り
 */

export function parseNarration(text: string): string[] {
  if (!text.trim()) return [];
  // 空行2行以上で分割
  const slides = text.split(/\n\s*\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return slides;
}
