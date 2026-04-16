/**
 * 動画出力（2段階方式）
 *
 * Phase 1 (キャプチャ): DOMを1フレームずつ確実にキャプチャしてJPEG保存
 *   - プレビューのscaleを一時的に1に設定
 *   - スライド切替時はReact再描画+背景ロード完了を十分待機
 *   - 速度は問わない（正確さ優先）
 *
 * Phase 2 (エンコード): 保存したフレームを正確な30fpsで再生しMediaRecorderで録画
 *   - 音声も同時再生して映像と同期
 *   - 壁時計ベースの録画なので、実際に33ms間隔で描画する
 */
import { toCanvas } from "html-to-image";

const FPS = 30;
const FRAME_INTERVAL = 1000 / FPS; // 33.33ms

/** Canvas → JPEG Blob */
function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b || new Blob()),
      "image/jpeg",
      quality,
    );
  });
}

/** 指定ms待機 */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** requestAnimationFrame N回待ち */
function waitFrames(n: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let count = 0;
    function tick() {
      count++;
      if (count >= n) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
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
): Promise<Blob> {
  const totalDuration = durations.reduce((a, b) => a + b, 0);
  const totalFrames = Math.ceil(totalDuration * FPS);

  // 出力用Canvas
  const outCanvas = document.createElement("canvas");
  outCanvas.width = 1920;
  outCanvas.height = 1080;
  const outCtx = outCanvas.getContext("2d")!;

  // ── プレビューのscaleを一時的に1に設定 ──
  const origTransform = previewEl.style.transform;
  previewEl.style.transform = "scale(1)";
  previewEl.style.transformOrigin = "top left";

  /* ================================================================ */
  /*  Phase 1: フレームキャプチャ（速度不問・正確さ優先）               */
  /* ================================================================ */
  const frameBlobs: Blob[] = [];
  let prevSlideIdx = -1;

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

      // スライド・時間を設定
      setSlide(slideIdx);
      setTime(slideTime);

      // スライド切り替え時は十分に待つ
      if (slideIdx !== prevSlideIdx) {
        // React再描画 + 背景画像ロードを待機
        await waitFrames(5);
        if (isReady) {
          const deadline = performance.now() + 3000;
          while (!isReady() && performance.now() < deadline) {
            await waitFrames(2);
          }
        }
        // さらに少し待ってDOMの安定を確保
        await delay(100);
        prevSlideIdx = slideIdx;
      } else {
        await waitFrames(2);
      }

      // DOMをキャプチャ
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
        // キャプチャ失敗時は前フレームを維持
      }

      // JPEG Blobとして保存
      const blob = await canvasToBlob(outCanvas, 0.85);
      frameBlobs.push(blob);

      onProgress((frameIndex / totalFrames) * 50); // 0〜50%
    }
  } finally {
    // ── scaleを復元 ──
    previewEl.style.transform = origTransform;
    previewEl.style.transformOrigin = "center center";
  }

  /* ================================================================ */
  /*  Phase 2: 正確な30fpsで再生しながら録画                           */
  /* ================================================================ */
  const stream = outCanvas.captureStream(FPS);

  // 音声トラック構築
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
          combined.getChannelData(ch).set(src.subarray(0, copyLen), sampleOffset);
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

  // MediaRecorder開始
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
      // キャプチャフレームのBlobURLを解放
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

      // 保存済みフレームをCanvasに描画
      try {
        const bitmap = await createImageBitmap(frameBlobs[playbackIndex]);
        outCtx.clearRect(0, 0, 1920, 1080);
        outCtx.drawImage(bitmap, 0, 0, 1920, 1080);
        bitmap.close();
      } catch {
        // 描画失敗時はスキップ
      }

      playbackIndex++;
      onProgress(50 + (playbackIndex / frameBlobs.length) * 50); // 50〜100%

      // 正確な33ms間隔を維持
      const elapsed = performance.now() - startTime;
      const waitTime = Math.max(0, FRAME_INTERVAL - elapsed);
      setTimeout(playNextFrame, waitTime);
    }

    playNextFrame().catch(reject);
  });
}
