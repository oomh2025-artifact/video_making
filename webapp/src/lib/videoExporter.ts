/**
 * 動画出力（シンプルなリアルタイム録画方式）
 *
 * 方針: プレビュー再生をそのままMediaRecorderで録画
 *   - 音声は実際に再生、MediaRecorderがそれを録音
 *   - プレビューDOMを随時outCanvasにコピー、そのストリームを録画
 *   - 録画時間 = 音声時間（壁時計ベース、ずれない）
 *   - toCanvas速度が追いつかない分はフレームが重複するが、タイミングは正確
 */
import { toCanvas } from "html-to-image";

const FPS = 30;

export async function exportVideoFromDOM(
  previewEl: HTMLElement,
  durations: number[],
  slideAudioUrls: string[],
  setSlide: (index: number) => void,
  setTime: (time: number) => void,
  onProgress: (pct: number) => void,
  _isReady?: () => boolean,
  _slides?: unknown,
): Promise<Blob> {
  const totalDuration = durations.reduce((a, b) => a + b, 0);

  // 出力用Canvas（1920x1080 固定）
  const outCanvas = document.createElement("canvas");
  outCanvas.width = 1920;
  outCanvas.height = 1080;
  const outCtx = outCanvas.getContext("2d")!;
  outCtx.fillStyle = "#FFFFFF";
  outCtx.fillRect(0, 0, 1920, 1080);

  /* ================================================================ */
  /*  音声トラック構築                                                  */
  /* ================================================================ */
  const audioCtx = new AudioContext();
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
  const audioSource = audioCtx.createBufferSource();
  audioSource.buffer = combined;
  audioSource.connect(dest);

  /* ================================================================ */
  /*  ストリーム構築                                                    */
  /* ================================================================ */
  const stream = outCanvas.captureStream(FPS);
  for (const track of dest.stream.getAudioTracks()) {
    stream.addTrack(track);
  }

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp8,opus",
    videoBitsPerSecond: 8_000_000,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  /* ================================================================ */
  /*  初期フレーム描画（録画開始前に1コマ入れておく）                    */
  /* ================================================================ */
  setSlide(0);
  setTime(0);
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );
  try {
    const initCaptured = await toCanvas(previewEl, {
      width: 1920,
      height: 1080,
      canvasWidth: 1920,
      canvasHeight: 1080,
      pixelRatio: 1,
      skipAutoScale: true,
      style: {
        transform: "none",
        transformOrigin: "top left",
      },
    });
    outCtx.clearRect(0, 0, 1920, 1080);
    outCtx.drawImage(initCaptured, 0, 0, 1920, 1080);
  } catch {
    // 失敗してもOK（白地のまま）
  }

  /* ================================================================ */
  /*  録画開始                                                          */
  /* ================================================================ */
  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      try { audioSource.stop(); } catch {}
      audioCtx.close();
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
    recorder.onerror = (e) => reject(e);

    recorder.start();
    const startPerf = performance.now();
    audioSource.start();

    const totalMs = totalDuration * 1000;
    let stopped = false;

    // 時刻からスライドindexとスライド内時刻を計算
    function computeSlidePos(globalTime: number): { idx: number; time: number } {
      let cumTime = 0;
      for (let i = 0; i < durations.length; i++) {
        if (globalTime < cumTime + durations[i]) {
          return { idx: i, time: globalTime - cumTime };
        }
        cumTime += durations[i];
      }
      return { idx: durations.length - 1, time: globalTime - cumTime };
    }

    // キャプチャループ（壁時計ベース）
    async function captureLoop() {
      if (stopped) return;

      const elapsedMs = performance.now() - startPerf;

      if (elapsedMs >= totalMs) {
        stopped = true;
        // 少し待ってから停止（最終フレームのエンコード完了待ち）
        setTimeout(() => recorder.stop(), 300);
        return;
      }

      const globalTime = elapsedMs / 1000;
      const { idx, time } = computeSlidePos(globalTime);

      // プレビューの状態を更新
      setSlide(idx);
      setTime(time);

      // React再描画待ち
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      // プレビューをoutCanvasにコピー
      try {
        const captured = await toCanvas(previewEl, {
          width: 1920,
          height: 1080,
          canvasWidth: 1920,
          canvasHeight: 1080,
          pixelRatio: 1,
          skipAutoScale: true,
          style: {
            transform: "none",
            transformOrigin: "top left",
          },
        });
        outCtx.clearRect(0, 0, 1920, 1080);
        outCtx.drawImage(captured, 0, 0, 1920, 1080);
      } catch {
        // キャプチャ失敗時は前フレーム維持
      }

      onProgress(Math.min(100, (elapsedMs / totalMs) * 100));

      // 次のキャプチャ
      requestAnimationFrame(captureLoop);
    }

    captureLoop().catch(reject);
  });
}
