# 申し送り：音声同期の問題

## 現状の問題
エディタでスライドを再生すると、音声とアニメーションがずれる。後半のスライドほどずれが大きい。

## 該当ファイル
- `webapp/src/pages/EditorPage.tsx` — 再生ロジック全体
- `webapp/src/lib/timingParser.ts` — タイミングデータのパース
- `webapp/src/lib/mergeSlides.ts` — `slide.duration` の設定元

## ユーザーの入力データ
タイミングデータ形式：
```
スライド 1:  0:21.74（音声 0:20.99 + 後0.75秒）
スライド 2:  0:33.29（前0.75秒 + 音声 0:31.79 + 後0.75秒）
スライド 3:  0:42.25（前0.75秒 + 音声 0:40.75 + 後0.75秒）
...
スライド 10:  0:41.57（前0.75秒 + 音声 0:40.82）
```
- `0:21.74` = スライド表示時間（パディング込み）→ `slide.duration` に使用
- `音声 0:20.99` = 実際のナレーション長さ
- `前0.75秒` / `後0.75秒` = スライド切り替え時の無音パディング

音声ファイル：
- Azure TTSで生成した1本のWAV（全スライド分のナレーション結合）
- ユーザーいわく「ナレーションの間に無音（間）を入れている」
- ローカルのRemotion版ではsplit_audio.pyで分割し、各スライドに個別WAVを割り当てて正常動作

## 現在のEditorPage.tsxの再生ロジック
```typescript
// 音声オフセット = 表示時間の累積
slideAudioOffsets = [0, 21.74, 55.03, 97.28, ...]

// シーク
audio.currentTime = slideAudioOffsets[slideIndex] + timeInSlide

// アニメーション時間 = 音声の再生位置から計算
currentTime = audio.currentTime - slideAudioOffsets[currentSlideIndex]
```

## 試した方法と結果
1. **表示時間の累積でシーク** → ずれる
2. **音声時間（0:20.99等）の累積でシーク** → 余計にずれた
3. **performance.now()でアニメーション独立計算** → ずれる
4. **audio.currentTimeをマスタークロック** → ずれる
5. **パディング無音を挿入したバッファ生成** → めちゃくちゃになった

## 根本の疑問
- WAVファイルの実際の長さと、表示時間の合計（約361秒）が一致するのか？
- WAV内のスライド境界の位置が、表示時間の累積と一致するのか？
- ユーザーが「間を入れている」と言う無音は、表示時間のパディング（前0.75秒+後0.75秒）と同じ長さなのか？

## Remotion版との違い
Remotion版では各スライドに個別の音声ファイルを割り当てる。
累積オフセットの計算が不要なのでずれない。
Webアプリでも同様に、WAVをスライドごとにブラウザ内で分割して個別に再生する方法が最も確実かもしれない。

## プロジェクト構成
```
video_making/webapp/
├── src/
│   ├── App.tsx                    # ページルーティング
│   ├── pages/
│   │   ├── SetupPage.tsx          # PPTX・秒数・音声の入力
│   │   └── EditorPage.tsx         # ★音声同期の問題はここ
│   ├── components/
│   │   ├── SlidePreview.tsx       # スライド描画（Remotion準拠）
│   │   ├── Timeline.tsx           # タイムライン
│   │   ├── PlaybackControls.tsx   # 再生コントロール
│   │   └── PropertyPanel.tsx      # プロパティパネル
│   ├── lib/
│   │   ├── pptxParser.ts          # PPTXパース
│   │   ├── timingParser.ts        # タイミングデータパース
│   │   ├── labeler.ts             # ラベリング
│   │   ├── animationAssigner.ts   # アニメーション割り当て
│   │   ├── mergeSlides.ts         # slides.json生成
│   │   ├── videoExporter.ts       # 動画出力（Canvas+MediaRecorder）
│   │   ├── labelNames.ts          # 日本語ラベル名
│   │   └── narrationParser.ts     # 未使用（削除可）
│   ├── types/slides.ts            # 型定義
│   └── styles/global.css          # CSS
├── public/
│   ├── slides/                    # 背景PNG（assets/slides/からコピー）
│   ├── icons/                     # アイコンPNG（assets/icons/からコピー）
│   └── audio/                     # 分割済み音声（assets/audio/からコピー）
└── package.json
```
