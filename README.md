# PPTX → Remotion 動画変換パイプライン

PowerPoint（.pptx）のスライド資料を、要素ごとのアニメーション付きMP4動画に自動変換します。

## 必要環境

- **OS:** Windows（PowerPoint COM を使用）
- **Microsoft PowerPoint:** インストール済み
- **Python 3.10+**
- **Node.js 18+**
- **環境変数:** `ANTHROPIC_API_KEY`（Claude Vision API 用）

## 初回セットアップ

```bat
REM 管理者権限のコマンドプロンプトで実行
setup.bat
```

これにより以下が実行されます:
1. Python パッケージインストール（python-pptx, anthropic, Pillow, comtypes）
2. Remotion npm install
3. assets フォルダへのシンボリックリンク作成

## 使い方

### 1. 音声ファイルを配置

`assets/audio/` に Azure TTS で生成した WAV ファイルを配置します。

### 2. 音声タイミングデータを配置

`data/audio_timing.json` を以下の形式で作成します:

```json
{
    "slides": [
        {"slide_index": 0, "audio_file": "slide_01.wav", "duration_sec": 5.2},
        {"slide_index": 1, "audio_file": "slide_02.wav", "duration_sec": 12.8}
    ]
}
```

### 3. パイプライン実行

```bat
set ANTHROPIC_API_KEY=sk-ant-api03-...
run_pipeline.bat input.pptx
```

### 4. 出力

`remotion/out/video.mp4` に動画が生成されます。

## 各ステップの個別実行

必要に応じて個別のスクリプトを実行できます:

```bat
REM Step 1: シェイプ抽出
python scripts/extract_shapes.py input.pptx data

REM Step 2: スライドPNG書き出し（PowerPoint COM）
python scripts/export_slides.py input.pptx

REM Step 3: アイコン書き出し
python scripts/export_icons.py input.pptx

REM Step 4: Vision APIラベリング
python scripts/label_elements.py

REM Step 5: ラベル確認（初回のみ）
python scripts/verify_labels.py

REM Step 6: マージ＆アニメーション割り当て
python scripts/merge_and_assign.py

REM Step 7: プレビュー
cd remotion && npx remotion preview src/Root.tsx

REM Step 8: MP4書き出し
npx remotion render src/Root.tsx SlideShow out/video.mp4 --codec h264 --pixel-format yuv420p --crf 18
```

## ディレクトリ構成

```
project/
├── scripts/          Python変換スクリプト
├── assets/
│   ├── slides/       スライドPNG（export_slides.pyが生成）
│   ├── icons/        アイコンPNG（export_icons.pyが生成）
│   └── audio/        音声WAV（ユーザーが配置）
├── data/
│   ├── raw_shapes.json        シェイプ抽出結果
│   ├── labeled_elements.json  ラベリング結果
│   ├── audio_timing.json      音声タイミング（ユーザーが配置）
│   └── slides.json            最終JSON（Remotion入力）
└── remotion/         Remotionプロジェクト
```

## トラブルシューティング

- **PowerPoint COM エラー:** PowerPoint が起動中の場合は閉じてからスクリプトを実行
- **mklink エラー:** 管理者権限でコマンドプロンプトを開いて setup.bat を再実行
- **フォント表示の問題:** メイリオがインストールされていることを確認
- **Vision API エラー:** ANTHROPIC_API_KEY が正しく設定されているか確認
