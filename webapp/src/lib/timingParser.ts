/**
 * ユーザー入力のタイミングデータをパース
 * 形式例: "スライド 1:  0:21.74（音声 0:20.99 + 後0.75秒）"
 * → 最初の時間値（パディング込み表示時間）を使用
 */

export interface TimingEntry {
  slideIndex: number;
  durationSec: number;
}

function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  return parseFloat(timeStr);
}

export function parseTimingText(text: string): TimingEntry[] {
  const entries: TimingEntry[] = [];
  for (const line of text.trim().split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const slideMatch = trimmed.match(/スライド\s*(\d+)/);
    if (!slideMatch) continue;

    const afterColon = trimmed.slice(trimmed.indexOf(":", trimmed.indexOf(slideMatch[0]) + slideMatch[0].length) + 1);
    const timeMatch = afterColon.match(/(\d+:\d+\.\d+)/);
    if (!timeMatch) continue;

    entries.push({
      slideIndex: parseInt(slideMatch[1], 10) - 1,
      durationSec: timeToSeconds(timeMatch[1]),
    });
  }
  return entries;
}
