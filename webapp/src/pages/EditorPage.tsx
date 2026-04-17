import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { SlidesData, SlideElement } from "../types/slides";
import SlidePreview from "../components/SlidePreview";
import type { SlidePreviewHandle } from "../components/SlidePreview";
import Timeline from "../components/Timeline";
import PlaybackControls from "../components/PlaybackControls";
import PropertyPanel from "../components/PropertyPanel";
import { exportVideoFromDOM } from "../lib/videoExporter";

interface Props {
  slidesData: SlidesData;
  audioFile: File | null;
  onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  AudioBuffer → WAV Blob エンコーダ                                   */
/* ------------------------------------------------------------------ */
function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const dataBytes = len * numCh * 2; // 16-bit PCM
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);

  const w = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };

  w(0, "RIFF");
  dv.setUint32(4, 36 + dataBytes, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);       // chunk size
  dv.setUint16(20, 1, true);        // PCM
  dv.setUint16(22, numCh, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * numCh * 2, true);
  dv.setUint16(32, numCh * 2, true);
  dv.setUint16(34, 16, true);       // bits per sample
  w(36, "data");
  dv.setUint32(40, dataBytes, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numCh; ch++) channels.push(buffer.getChannelData(ch));

  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      dv.setInt16(off, s * (s < 0 ? 0x8000 : 0x7fff), true);
      off += 2;
    }
  }

  return new Blob([buf], { type: "audio/wav" });
}

/* ------------------------------------------------------------------ */
/*  EditorPage                                                         */
/* ------------------------------------------------------------------ */
export default function EditorPage({ slidesData, audioFile, onBack }: Props) {
  const [data, setData] = useState<SlidesData>(slidesData);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editMode, setEditMode] = useState(true);

  const animFrameRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewRef = useRef<SlidePreviewHandle>(null);

  const currentSlide = data.slides[currentSlideIndex];
  const selectedElement =
    currentSlide?.elements.find((e) => e.id === selectedElementId) || null;

  /* ================================================================ */
  /*  音声分割: WAV をスライドごとに切り出して個別 Blob URL を生成       */
  /*  ── 累積オフセット計算を完全に排除し、Remotion 版と同じ構造にする   */
  /* ================================================================ */
  const [slideAudioUrls, setSlideAudioUrls] = useState<string[]>([]);
  const [audioReady, setAudioReady] = useState(false);
  const audioUrlsRef = useRef<string[]>([]);

  // duration の変化だけを検知する安定キー（要素編集では変わらない）
  const durationKey = useMemo(
    () => data.slides.map((s) => s.duration).join(","),
    [data.slides],
  );

  useEffect(() => {
    if (!audioFile) {
      setSlideAudioUrls([]);
      setAudioReady(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const arrayBuf = await audioFile.arrayBuffer();
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(arrayBuf);

        // duration 一覧を durationKey から復元（effect 実行時点の値を使う）
        const durations = durationKey.split(",").map(Number);
        const numSlides = durations.length;
        const displayTotal = durations.reduce((a, b) => a + b, 0);
        const wavDuration = decoded.duration;

        // ── パディング二重カウントの自動検出 ──
        // 表示時間: スライド1(後0.75) + スライド2(前0.75+後0.75) + ...
        // WAV内:    ナレーション + 0.75s無音 + ナレーション + 0.75s無音 + ...
        //
        // 隣接スライド間の無音はWAVでは1回だが、表示では
        // 「前スライドの後パディング＋次スライドの前パディング」で2回カウントされる。
        // この差分を境界数(N-1)で割れば、1境界あたりの重複量が求まる。
        const overlap =
          numSlides > 1 ? (displayTotal - wavDuration) / (numSlides - 1) : 0;

        console.log(
          `[AudioSplit] WAV実長=${wavDuration.toFixed(3)}s, ` +
            `表示合計=${displayTotal.toFixed(3)}s, ` +
            `差分=${(displayTotal - wavDuration).toFixed(3)}s, ` +
            `1境界あたり重複=${overlap.toFixed(3)}s`,
        );

        // 累積表示時間を計算
        const cumDisplay: number[] = [];
        let cum = 0;
        for (const d of durations) {
          cumDisplay.push(cum);
          cum += d;
        }

        // WAV上の実オフセット:
        //   スライド0: WAV_offset = cumDisplay[0] = 0（前パディングなし）
        //   スライドi: WAV_offset = cumDisplay[i] - i * overlap
        //     → i番目までの境界で i 回分の二重カウントを差し引く
        const urls: string[] = [];

        for (let i = 0; i < numSlides; i++) {
          const wavStart = cumDisplay[i] - i * overlap;
          const wavEnd =
            i < numSlides - 1
              ? cumDisplay[i + 1] - (i + 1) * overlap
              : wavDuration; // 最後は WAV 末尾まで

          const startSample = Math.round(
            Math.max(0, wavStart) * decoded.sampleRate,
          );
          const endSample = Math.min(
            Math.round(wavEnd * decoded.sampleRate),
            decoded.length,
          );
          const segLen = Math.max(0, endSample - startSample);

          if (segLen <= 0) {
            urls.push("");
          } else {
            const seg = new AudioBuffer({
              numberOfChannels: decoded.numberOfChannels,
              length: segLen,
              sampleRate: decoded.sampleRate,
            });
            for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
              seg
                .getChannelData(ch)
                .set(decoded.getChannelData(ch).subarray(startSample, startSample + segLen));
            }
            urls.push(URL.createObjectURL(encodeWav(seg)));
          }
        }

        await ctx.close();

        if (cancelled) {
          urls.forEach((u) => u && URL.revokeObjectURL(u));
          return;
        }

        // 前回の URL を解放
        audioUrlsRef.current.forEach((u) => u && URL.revokeObjectURL(u));
        audioUrlsRef.current = urls;
        setSlideAudioUrls(urls);
        setAudioReady(true);

        console.log(
          `[AudioSplit] ${urls.length} segments, overlap/boundary=${overlap.toFixed(3)}s`,
        );
      } catch (e) {
        console.error("[AudioSplit] 分割失敗:", e);
      }
    })();

    return () => {
      cancelled = true;
      audioUrlsRef.current.forEach((u) => u && URL.revokeObjectURL(u));
      audioUrlsRef.current = [];
    };
  }, [audioFile, durationKey]);

  /* ================================================================ */
  /*  現在スライドの音声要素をロード                                    */
  /* ================================================================ */
  useEffect(() => {
    const url = slideAudioUrls[currentSlideIndex];
    if (!url) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }
    const audio = new Audio(url);
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [slideAudioUrls, currentSlideIndex]);

  /* ================================================================ */
  /*  再生ループ — オフセット不要、audio.currentTime をそのまま利用      */
  /* ================================================================ */
  useEffect(() => {
    if (!isPlaying) return;
    const audio = audioRef.current;

    const tick = () => {
      const t = audio ? audio.currentTime : currentTime;
      if (t >= currentSlide.duration) {
        setIsPlaying(false);
        audio?.pause();
        setCurrentTime(currentSlide.duration);
        return;
      }
      setCurrentTime(Math.max(0, t));
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
    // currentTime は tick 内で自己更新するので依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentSlide.duration]);

  /* ================================================================ */
  /*  操作ハンドラ                                                     */
  /* ================================================================ */
  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      audioRef.current?.pause();
    } else {
      const audio = audioRef.current;
      const t = currentTime >= currentSlide.duration ? 0 : currentTime;
      if (currentTime >= currentSlide.duration) setCurrentTime(0);
      if (audio) {
        audio.currentTime = t;
        audio.play().catch(() => {});
      }
      setIsPlaying(true);
    }
  }, [isPlaying, currentTime, currentSlide.duration]);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    setIsPlaying(false);
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = time;
  }, []);

  const handleSlideChange = useCallback((index: number) => {
    setCurrentSlideIndex(index);
    setCurrentTime(0);
    setIsPlaying(false);
    setSelectedElementId(null);
    audioRef.current?.pause();
  }, []);

  const handleUpdateElement = useCallback(
    (elementId: string, updates: Partial<SlideElement>) => {
      setData((prev) => ({
        ...prev,
        slides: prev.slides.map((slide) => ({
          ...slide,
          elements: slide.elements.map((el) =>
            el.id === elementId ? { ...el, ...updates } : el,
          ),
        })),
      }));
    },
    [],
  );

  const handleDeleteElement = useCallback(
    (elementId: string) => {
      setData((prev) => ({
        ...prev,
        slides: prev.slides.map((slide) => ({
          ...slide,
          elements: slide.elements.filter((el) => el.id !== elementId),
        })),
      }));
      setSelectedElementId(null);
    },
    [],
  );

  /* ================================================================ */
  /*  エクスポート                                                     */
  /* ================================================================ */
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const handleExportJson = useCallback(() => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "slides.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const handleExportVideo = useCallback(async () => {
    const canvasEl = previewRef.current?.getCanvasEl();
    if (!canvasEl) {
      alert("プレビューが見つかりません");
      return;
    }

    // 出力中は編集モードOFF（枠を消す）
    setEditMode(false);
    setIsPlaying(false);
    setExporting(true);
    setExportProgress(0);

    try {
      const durations = data.slides.map((s) => s.duration);
      const blob = await exportVideoFromDOM(
        canvasEl,
        durations,
        slideAudioUrls,
        (idx) => setCurrentSlideIndex(idx),
        (t) => setCurrentTime(t),
        (pct) => setExportProgress(pct),
        () => previewRef.current?.isReady() ?? true,
        data.slides,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "slides.webm";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("動画出力エラー:", e);
      alert("動画の出力に失敗しました: " + (e instanceof Error ? e.message : "不明なエラー"));
    } finally {
      setExporting(false);
    }
  }, [data.slides, slideAudioUrls]);

  /* ================================================================ */
  /*  レンダリング                                                     */
  /* ================================================================ */
  return (
    <div className="editor-page">
      <div className="editor-header">
        <button className="back-btn" onClick={onBack}>
          ← 戻る
        </button>
        <h1>Slide Editor</h1>

        {/* 音声分割中インジケータ */}
        {audioFile && !audioReady && (
          <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>
            音声を準備中…
          </span>
        )}

        <button
          className={`header-btn toggle ${editMode ? "active" : ""}`}
          onClick={() => setEditMode(!editMode)}
        >
          {editMode ? "編集中" : "プレビュー"}
        </button>
        <button className="header-btn primary" onClick={handleExportVideo} disabled={exporting}>
          {exporting ? `動画出力中 ${Math.round(exportProgress)}%` : "動画出力"}
        </button>
        <button className="header-btn toggle" onClick={handleExportJson}>
          JSON出力
        </button>
      </div>

      <div className="editor-body">
        <div className="editor-main">
          <div className="slide-tabs">
            {data.slides.map((_slide, i) => (
              <button
                key={i}
                className={`slide-tab ${i === currentSlideIndex ? "active" : ""}`}
                onClick={() => handleSlideChange(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="preview-area">
            {currentSlide && (
              <SlidePreview
                ref={previewRef}
                slide={currentSlide}
                currentTime={currentTime}
                selectedElementId={selectedElementId}
                editMode={editMode}
                onSelectElement={setSelectedElementId}
              />
            )}
          </div>

          <PlaybackControls
            currentTime={currentTime}
            duration={currentSlide?.duration || 0}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
          />

          {currentSlide && (
            <Timeline
              elements={currentSlide.elements}
              duration={currentSlide.duration}
              currentTime={currentTime}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
            />
          )}
        </div>

        {currentSlide && (
          <PropertyPanel
            slide={currentSlide}
            selectedElement={selectedElement}
            onUpdateElement={handleUpdateElement}
            onDeleteElement={handleDeleteElement}
            onSelectElement={setSelectedElementId}
          />
        )}
      </div>
    </div>
  );
}
