/**
 * 動画出力（2段階方式＋スマートスキップ＋wobbleサイクル再利用）
 *
 * 最適化:
 * 1. アニメーション中のみDOMキャプチャ、静止中は再利用
 * 2. wobbleは1周期（~47フレーム）だけキャプチャしてループ再利用
 */
import { toCanvas } from "html-to-image";

const FPS = 30;
const FRAME_INTERVAL = 1000 / FPS;
const WOBBLE_FREQ = 4; // Math.sin(t * 4) の周波数
const WOBBLE_PERIOD = (2 * Math.PI) / WOBBLE_FREQ; // ≈1.57秒
const WOBBLE_CYCLE_FRAMES = Math.ceil(WOBBLE_PERIOD * FPS); // ≈47フレーム

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b || new Blob()), "image/jpeg", quality);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitFrames(n: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let count = 0;
    function tick() {
      if (++count >= n) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

interface SlideAnimInfo {
  /** 入場アニメーションの最終終了時刻 */
  entryAnimEnd: number;
  /** wobble等のループアニメがあるか */
  hasLoop: boolean;
}

function computeAnimInfo(
  slides: Array<{
    elements: Array<{
      animation: { type: string; delay: number; duration: number };
    }>;
  }>,
): SlideAnimInfo[] {
  return slides.map((s) => {
    let entryEnd = 0;
    let hasLoop = false;
    for (const el of s.elements) {
      if (el.animation.type === "wobble") {
        hasLoop = true;
      } else {
        const end = el.animation.delay + el.animation.duration;
        if (end > entryEnd) entryEnd = end;
      }
    }
    return { entryAnimEnd: entryEnd, hasLoop };
  });
}

export async function exportVideoFromDOM(
  previewEl: HTMLElement,
  durations: number[],
  slideAudioUrls: string[],
  setSlide: (index: number) => void,
  setTime: (time: number) => void,
  onProgress: (pct: number) => void,
  isReady?: () => boolean,
  slides?: Array<{
    elements: Array<{
      animation: { type: string; delay: number; duration: number };
    }>;
  }>,
): Promise<Blob> {
  const totalDuration = durations.reduce((a, b) => a + b, 0);
  const totalFrames = Math.ceil(totalDuration * FPS);
  const animInfo = slides ? computeAnimInfo(slides) : null;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = 1920;
  outCanvas.height = 1080;
  const outCtx = outCanvas.getContext("2d")!;

  // プレビューのscaleを一時的に1に設定
  const origTransform = previewEl.style.transform;
  previewEl.style.transform = "scale(1)";
  previewEl.style.transformOrigin = "top left";

  /* ================================================================ */
  /*  Phase 1: スマートキャプチャ                                      */
  /* ================================================================ */
  const frameBlobs: Blob[] = [];
  let prevSlideIdx = -1;
  let lastCapturedBlob: Blob | null = null;

  // wobbleサイクル管理（スライドごとにリセット）
  let wobbleCycleBlobs: Blob[] = [];
  let wobbleCycleReuse = 0;

  let capturedCount = 0;
  let skippedCount = 0;

  /** DOMキャプチャ実行 */
  async function captureFrame(slideIdx: number, slideTime: number, slideChanged: boolean): Promise<Blob> {
    setSlide(slideIdx);
    setTime(slideTime);

    if (slideChanged) {
      await waitFrames(5);
      if (isReady) {
        const deadline = performance.now() + 3000;
        while (!isReady() && performance.now() < deadline) {
          await waitFrames(2);
        }
      }
      await delay(100);
    } else {
      await waitFrames(2);
    }

    try {
      const captured = await toCanvas(previewEl, {
        width: 1920,
        height: 1080,
        canvasWidth: 1920,
        canvasHeight: 1080,
        pixelRatio: 1,
        skipAutoScale: true,
      });
      outCtx.clearRect(0, 0, 1920, 1080);
      outCtx.drawImage(captured, 0, 0, 1920, 1080);
    } catch {
      // 失敗時は前フレーム維持
    }

    capturedCount++;
    return canvasToBlob(outCanvas, 0.85);
  }

  try {
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      const globalTime = frameIndex / FPS;

      // どのスライドか判定
      let cumTime = 0;
      let slideIdx = 0;
      for (let i = 0; i < durations.length; i++) {
        if (globalTime < cumTime + durations[i]) {
          slideIdx = i;
          break;
        }
        cumTime += durations[i];
        if (i === durations.length - 1) slideIdx = i;
      }
      const slideTime = globalTime - cumTime;
      const slideChanged = slideIdx !== prevSlideIdx;

      if (slideChanged) {
        // スライド切り替え → wobbleサイクルをリセット
        wobbleCycleBlobs = [];
        wobbleCycleReuse = 0;
        prevSlideIdx = slideIdx;
      }

      const info = animInfo?.[slideIdx];
      const entryEnd = info?.entryAnimEnd ?? Infinity;
      const hasLoop = info?.hasLoop ?? false;
      const inEntryAnim = slideTime <= entryEnd + 0.2;

      let blob: Blob;

      if (slideChanged || inEntryAnim || !lastCapturedBlob) {
        // ── 入場アニメーション中 or スライド切替 → 必ずキャプチャ ──
        blob = await captureFrame(slideIdx, slideTime, slideChanged);
        lastCapturedBlob = blob;
        // 入場中はwobbleサイクルをリセット状態に保つ
        wobbleCycleBlobs = [];
        wobbleCycleReuse = 0;
      } else if (hasLoop) {
        // ── wobbleフェーズ → 1周期キャプチャ後はループ再利用 ──
        if (wobbleCycleBlobs.length < WOBBLE_CYCLE_FRAMES) {
          // まだ1周期分キャプチャしていない
          blob = await captureFrame(slideIdx, slideTime, false);
          wobbleCycleBlobs.push(blob);
          lastCapturedBlob = blob;
        } else {
          // 1周期キャプチャ済み → 使い回し
          blob = wobbleCycleBlobs[wobbleCycleReuse % WOBBLE_CYCLE_FRAMES];
          wobbleCycleReuse++;
          skippedCount++;
        }
      } else {
        // ── 完全静止 → 前フレーム再利用 ──
        blob = lastCapturedBlob;
        skippedCount++;
      }

      frameBlobs.push(blob);
      onProgress((frameIndex / totalFrames) * 50);
    }
  } finally {
    previewEl.style.transform = origTransform;
    previewEl.style.transformOrigin = "center center";
  }

  console.log(
    `[Export] キャプチャ ${capturedCount}枚 / スキップ ${skippedCount}枚` +
      ` (${Math.round((skippedCount / totalFrames) * 100)}%削減)`,
  );

  /* ================================================================ */
  /*  Phase 2: 正確な30fpsで再生しながら録画                           */
  /* ================================================================ */
  const stream = outCanvas.captureStream(FPS);

  let audioSource: AudioBufferSourceNode | null = null;
  let audioCtx: AudioContext | null = null;

  try {
    audioCtx = new AudioContext();
    const buffers: AudioBuffer[] = [];
    for (const url of slideAudioUrls) {
      if (!url) {
        buffers.push(audioCtx.createBuffer(1, 1, audioCtx.sampleRate));
        continue;
      }
      const resp = await fetch(url);
      const arr = await resp.arrayBuffer();
      buffers.push(await audioCtx.decodeAudioData(arr));
    }

    const channels = Math.max(1, ...buffers.map((b) => b.numberOfChannels));
    const sr = buffers[0]?.sampleRate || 44100;
    const totalSamples = Math.round(totalDuration * sr);
    const combined = audioCtx.createBuffer(channels, totalSamples, sr);

    let sampleOffset = 0;
    for (let i = 0; i < durations.length; i++) {
      const slotSamples = Math.round(durations[i] * sr);
      const buf = buffers[i];
      if (buf) {
        const copyLen = Math.min(buf.length, slotSamples);
        for (let ch = 0; ch < channels; ch++) {
          const src =
            ch < buf.numberOfChannels
              ? buf.getChannelData(ch)
              : new Float32Array(copyLen);
          combined
            .getChannelData(ch)
            .set(src.subarray(0, copyLen), sampleOffset);
        }
      }
      sampleOffset += slotSamples;
    }

    const dest = audioCtx.createMediaStreamDestination();
    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = combined;
    audioSource.connect(dest);
    for (const track of dest.stream.getAudioTracks()) {
      stream.addTrack(track);
    }
  } catch (e) {
    console.warn("音声トラック構築失敗:", e);
  }

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp8,opus",
    videoBitsPerSecond: 8_000_000,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      audioSource?.stop();
      audioCtx?.close();
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
    recorder.onerror = (e) => reject(e);

    recorder.start();
    audioSource?.start();

    let playbackIndex = 0;

    async function playNextFrame() {
      if (playbackIndex >= frameBlobs.length) {
        await delay(200);
        recorder.stop();
        return;
      }

      const startTime = performance.now();

      try {
        const bitmap = await createImageBitmap(frameBlobs[playbackIndex]);
        outCtx.clearRect(0, 0, 1920, 1080);
        outCtx.drawImage(bitmap, 0, 0, 1920, 1080);
        bitmap.close();
      } catch {
        // スキップ
      }

      playbackIndex++;
      onProgress(50 + (playbackIndex / frameBlobs.length) * 50);

      const elapsed = performance.now() - startTime;
      const waitTime = Math.max(0, FRAME_INTERVAL - elapsed);
      setTimeout(playNextFrame, waitTime);
    }

    playNextFrame().catch(reject);
  });
}
