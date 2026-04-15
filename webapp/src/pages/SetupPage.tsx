import { useState, useRef, useCallback } from "react";
import type { SlidesData } from "../types/slides";
import { parsePptx } from "../lib/pptxParser";
import { parseTimingText } from "../lib/timingParser";
import { mergeAndAssign } from "../lib/mergeSlides";

interface Props {
  onComplete: (data: SlidesData, audioFile: File | null) => void;
}

export default function SetupPage({ onComplete }: Props) {
  const [pptxFile, setPptxFile] = useState<File | null>(null);
  const [timingText, setTimingText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const pptxInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const canStart = pptxFile !== null && timingText.trim().length > 0;

  const handleStart = useCallback(async () => {
    if (!pptxFile || !timingText.trim()) return;

    setProcessing(true);
    setError(null);

    try {
      const rawData = await parsePptx(pptxFile);
      const timingEntries = parseTimingText(timingText);
      const slidesData = mergeAndAssign(rawData, timingEntries, []);

      onComplete(slidesData, audioFile);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "処理中にエラーが発生しました");
      setProcessing(false);
    }
  }, [pptxFile, timingText, audioFile, onComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".pptx")) {
      setPptxFile(file);
    }
  }, []);

  return (
    <div className="setup-page">
      <h1>Slide Editor</h1>
      <p className="subtitle">PPTXを解析してアニメーション付きスライドを編集</p>

      {/* PPTX */}
      <div className="setup-section">
        <h2>PPTXファイル</h2>
        <p>PowerPointファイル（.pptx）をアップロード</p>
        <div
          className={`file-drop ${dragOver ? "dragover" : ""} ${pptxFile ? "has-file" : ""}`}
          onClick={() => pptxInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={pptxInputRef}
            type="file"
            accept=".pptx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPptxFile(f);
            }}
          />
          {pptxFile ? (
            <span>{pptxFile.name} ({(pptxFile.size / 1024).toFixed(0)} KB)</span>
          ) : (
            <span>クリックまたはドラッグ&ドロップ</span>
          )}
        </div>
      </div>

      {/* タイミング */}
      <div className="setup-section">
        <h2>各スライドの秒数</h2>
        <p>各スライドの表示時間をテキストで貼り付け</p>
        <textarea
          className="timing-textarea"
          placeholder={`スライド 1:  0:21.74（音声 0:20.99 + 後0.75秒）\nスライド 2:  0:33.29（前0.75秒 + 音声 0:31.79 + 後0.75秒）\n...`}
          value={timingText}
          onChange={(e) => setTimingText(e.target.value)}
        />
      </div>

      {/* 音声 */}
      <div className="setup-section">
        <h2>音声ファイル</h2>
        <p>WAV / MP3 ファイル</p>
        <div
          className={`file-drop ${audioFile ? "has-file" : ""}`}
          onClick={() => audioInputRef.current?.click()}
        >
          <input
            ref={audioInputRef}
            type="file"
            accept=".wav,.mp3"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setAudioFile(f);
            }}
          />
          {audioFile ? (
            <span>{audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(1)} MB)</span>
          ) : (
            <span>クリックして音声ファイルを選択</span>
          )}
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--danger)", marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      <button className="start-btn" disabled={!canStart || processing} onClick={handleStart}>
        {processing ? "処理中..." : "解析開始"}
      </button>

      {processing && (
        <div className="processing-overlay">
          <div className="processing-card">
            <div className="spinner" />
            <p>PPTXを解析中...</p>
          </div>
        </div>
      )}
    </div>
  );
}
