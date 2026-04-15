/**
 * 動画出力：プレビューDOMをフレームごとにキャプチャしてWebMに変換
 * プレビューと完全に同じ見た目を保証する
 *
 * 修正済み問題:
 * 1. 背景画像ロードを待ってからキャプチャ（レース排除）
 * 2. 分割音声をdisplay durationに合わせてパディング（音声長=映像長を保証）
 * 3. 音声再生をキャプチャ開始まで遅延（先行防止）
 */
import { toCanvas } from "html-to-image";

const FPS = 30;

/**
 * プレビューDOMをキャプチャして動画出力
 */
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

  // キャプチャ用Canvas
  const outCanvas = document.createElement("canvas");
  outCanvas.width = 1920;
  outCanvas.height = 1080;
  const outCtx = outCanvas.getContext("2d")!;

  // MediaRecorder（映像ストリーム）
  const stream = outCanvas.captureStream(0); // 手動フレーム送出

  /* ================================================================ */
  /*  音声トラック構築                                                  */
  /*  各セグメントをdisplay durationに合わせてパディングし、            */
  /*  音声合計 = 映像合計を保証する                                     */
  /* ================================================================ */
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

    // display duration に合わせた合計サンプル数（映像と同じ長さ）
    const totalSamples = Math.round(totalDuration * sr);
    const combined = audioCtx.createBuffer(channels, totalSamples, sr);

    // 各スライドの音声を display duration 分の枠に配置
    // → セグメントが短ければ残りは無音パディング
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
    // ★ start() はまだ呼ばない（キャプチャ開始時に呼ぶ）
  } catch (e) {
    console.warn("音声トラックの追加に失敗:", e);
  }

  /* ================================================================ */
  /*  描画完了待ちユーティリティ                                        */
  /* ================================================================ */
  async function waitForRender(): Promise<void> {
    // 最低2フレーム待ち（React再描画）
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );

    if (!isReady) return;

    // isReady() が true になるまでポーリング（最大2秒）
    const deadline = performance.now() + 2000;
    while (!isReady() && performance.now() < deadline) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
  }

  /* ================================================================ */
  /*  録画                                                             */
  /* ================================================================ */
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

    // 音声開始（録画と同時）
    try {
      audioSource?.start();
    } catch {
      // 音声なしでも映像は出力
    }

    let frameIndex = 0;
    let prevSlideIdx = -1;

    async function nextFrame() {
      if (frameIndex >= totalFrames) {
        setTimeout(() => recorder.stop(), 200);
        return;
      }

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

      // プレビューの状態を更新
      setSlide(slideIdx);
      setTime(slideTime);

      // スライド切り替え時は背景ロード完了を待つ
      if (slideIdx !== prevSlideIdx) {
        await waitForRender();
        prevSlideIdx = slideIdx;
      } else {
        // 同一スライド内は2フレーム待ちで十分
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
      }

      // プレビューDOMをキャプチャ
      try {
        const captured = await toCanvas(previewEl, {
          width: 1920,
          height: 1080,
          canvasWidth: 1920,
          canvasHeight: 1080,
          pixelRatio: 1,
        });
        outCtx.clearRect(0, 0, 1920, 1080);
        outCtx.drawImage(captured, 0, 0, 1920, 1080);
      } catch {
        // キャプチャ失敗時はスキップ
      }

      // 手動でフレームを送出
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && "requestFrame" in videoTrack) {
        (videoTrack as any).requestFrame();
      }

      frameIndex++;
      onProgress(Math.min(100, (frameIndex / totalFrames) * 100));

      // 次フレーム
      requestAnimationFrame(nextFrame);
    }

    nextFrame().catch(reject);
  });
}