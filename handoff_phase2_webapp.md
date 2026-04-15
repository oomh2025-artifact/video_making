# 引き継ぎ：Phase 2 Webアプリケーション → Claude Code実装用

> このドキュメントをClaude Codeに渡して、Phase 2のWebアプリを実装してください。
> 既存リポジトリの中に Vite + React プロジェクトを追加する作業です。


## 1. 既存リポジトリ

- **リポジトリ:** `https://github.com/oomh2025-artifact/video_making`（Private）
- **ローカルパス:** `C:\Users\user\Downloads\video_making`
- **Phase 1 完成済み:** Python変換スクリプト群 + Remotionプロジェクト → MP4出力まで動作確認済み

### 1.1 現在のディレクトリ構成

```
video_making/
├── scripts/                    # Python変換スクリプト（完成済み）
│   ├── constants.py
│   ├── extract_shapes.py       # PPTXからシェイプJSON抽出
│   ├── export_slides.py        # PowerPoint COMでPNG書き出し
│   ├── export_icons.py         # アイコン画像抽出
│   ├── label_elements.py       # Claude Vision APIでラベリング
│   ├── verify_labels.py        # ラベル目視確認
│   ├── merge_and_assign.py     # マージ＋アニメーション割り当て
│   ├── split_audio.py          # WAVをスライドごとに分割
│   └── narration_sync.py       # ナレーション同期（未完成）
│
├── data/                       # 中間・最終JSON
│   ├── raw_shapes.json         # extract_shapes.py の出力
│   ├── labeled_elements.json   # label_elements.py の出力
│   ├── audio_timing.json       # 手動作成済み
│   └── slides.json             # merge_and_assign.py の最終出力
│
├── assets/
│   ├── slides/                 # フル版・背景版PNG各10枚
│   ├── icons/                  # 埋込10件 + crop19件
│   └── audio/                  # 分割済みWAV10件 + 元WAV1件
│
├── remotion/                   # Remotionプロジェクト（完成済み）
│   ├── src/
│   │   ├── Root.tsx
│   │   ├── SlideShow.tsx
│   │   ├── SlideRenderer.tsx
│   │   ├── AnimatedElement.tsx
│   │   ├── fonts.ts
│   │   ├── types.ts
│   │   └── elements/
│   │       ├── TextElement.tsx
│   │       ├── RichTextElement.tsx
│   │       ├── IconElement.tsx
│   │       └── ImageElement.tsx
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   └── remotion.config.ts
│
├── .gitignore
└── README.md
```

### 1.2 テスト用データ（動作確認済み）

- **PPTX:** 快眠習慣で毎日のパフォーマンスを変える_スライド_修正版.pptx（10スライド）
- **音声:** Azure TTS生成 WAV（358.34秒、1ファイル結合 → split_audio.pyで分割済み）
- **slides.json:** 生成済み、Remotionでレンダリング確認済み
- **フォント:** Meiryo（メイリオ）→ Remotion側はNoto Sans JPフォールバック


## 2. Phase 2 で作るもの

### 2.1 概要

`video_making/webapp/` に Vite + React + TypeScript のSPAを新規作成する。
Netlify + GitHub でデプロイする（ユーザーが慣れている環境）。

### 2.2 画面フロー

```
[セットアップページ] → [内部処理] → [エディタページ]
```

### 2.3 セットアップページ（トップページ）

4つの入力を受け付ける。すべて入力したら「解析開始」ボタンで処理を実行し、エディタに遷移。

| # | 入力 | 必須 | 内容 |
|---|------|------|------|
| ① | PPTXファイル | ✅ | ファイルアップロード。ブラウザ内でJSZipで解凍→XMLパースしてシェイプ情報を抽出 |
| ② | 各スライドの秒数 | ✅ | テキスト貼り付け。ユーザーの形式をパース（後述） |
| ③ | ナレーション原稿 | 任意 | テキスト貼り付け。空行2行以上でスライド区切り |
| ④ | 音声ファイル | 任意 | WAV/MP3アップロード。エディタでのプレビュー再生用 |

### 2.4 内部処理（ブラウザ内で実行）

セットアップの「解析開始」ボタン押下後、以下を順次実行：

1. **PPTXパース**（JSZip + DOMParser）
   - PPTXはZIPファイル。JSZipで解凍
   - `ppt/presentation.xml` → スライドサイズ（EMU）取得
   - `ppt/slides/slide1.xml` 〜 → 各シェイプの座標・サイズ・テキスト・フォント属性を抽出
   - グループシェイプ（`p:grpSp`）は子要素を展開して座標オフセット加算
   - EMU→ピクセル変換: `px = emu / slideWidthEmu * 1920`
   - **これはPython版 extract_shapes.py のJS移植**

2. **タイミングデータパース**
   - ユーザーの入力形式: `スライド 1:  0:21.74（音声 0:20.99 + 後0.75秒）`
   - 最初の時間値（パディング込み表示時間）を抽出
   - `duration_sec` としてそのまま使用（merge_and_assign.pyで+1.0しない。パディング込みの値）

3. **ルールベースラベリング**
   - 各シェイプの座標・サイズ・テキスト内容から自動ラベル付与
   - **Vision APIは使わない**（Phase 1ではPNG画像が必要だったが、Webアプリでは生成できないため）
   - ラベリングロジックは merge_and_assign.py の `assign_label_by_position` と `assign_label_by_text_and_position` をJS移植
   - ラベル一覧は仕様書セクション3.5を参照

4. **アニメーション割り当て**
   - ラベルに基づいてアニメーション種類・ディレイ・速度を自動設定
   - delay動的計算（リストのstagger、アイコンの最寄りテキスト同時出現など）
   - ロジックは merge_and_assign.py の `calculate_delays` をJS移植

5. **slides.json 生成**
   - Phase 1のRemotionが読み込むのと同じ形式で出力

### 2.5 エディタページ

Phase 1仕様書セクション5.2のUI構成に準拠。

```
┌───────────────────────────────────────────────────┐
│  ← 戻る    Slide Editor    [編集中] [JSON出力]    │
├───────────────────────────────────────────────────┤
│                              │                    │
│  [1] [2] [3] ... [10]       │  要素プロパティ      │
│                              │  ────────────────  │
│  ┌──────────────────────┐   │  SLIDE_TITLE       │
│  │                      │   │  テキスト: ...      │
│  │  スライドプレビュー    │   │  X:80 Y:50 W:900  │
│  │  （アニメーション再現）│   │                    │
│  │                      │   │  アニメーション:     │
│  └──────────────────────┘   │  [fadeIn] [scaleIn] │
│                              │  ディレイ: ──●──   │
│  [⏮] [▶ 再生] ──●────── 3.2s/12.0s │  速度: ──●──     │
│                              │                    │
│  タイムライン                │  ────────────────  │
│  SLIDE_TITLE  ██             │  要素一覧 (6)      │
│  BODY_PARA    ──██           │  ● SLIDE_TITLE     │
│  CONTENT_ICON ──██           │  ● BODY_PARAGRAPH  │
│  BOTTOM_TAKE  ──────────██   │  ● CONTENT_ICON    │
│                              │  ...               │
└───────────────────────────────────────────────────┘
```

#### 機能一覧

- **スライド切り替え:** 上部の番号ボタン
- **プレビュー再生:** ▶ボタンでアニメーションを時間順に再現。音声ファイルがあれば同期再生
- **タイムスクラブ:** スライダーで任意の時間にシーク
- **タイムライン:** 各要素の出現タイミングをバーで可視化。再生位置にプレイヘッド線
- **要素選択:** プレビュー上の要素クリック、またはタイムライン/要素一覧クリック
- **プロパティ編集:**
  - アニメーション種類の変更（fadeIn / scaleIn / slideInLeft / slideInRight / slideInBottom）
  - ディレイ（秒）のスライダー調整
  - 速度（秒）のスライダー調整
- **編集モード切替:** ON時はラベル名の色付き枠を表示、OFF時は枠なしプレビュー
- **JSON出力:** 編集後のslides.jsonをダウンロード
- **戻るボタン:** セットアップページに戻る

#### プレビューの描画方法

- **背景:** PNGが無いので、slide_type に応じたグラデーション背景で代替
  - cover/end: 濃紺系グラデーション
  - paragraph/list: 薄灰系グラデーション + ヘッダーストライプ + ボトムバー
- **テキスト要素:** fontSize, fontColor, fontWeight, lineHeight を適用して描画
- **LIST_NUMBER:** 青い角丸背景 + 白太字で番号表示
- **アイコン:** プレースホルダー（色付き枠 + アイコン絵文字）
- **アニメーション:** CSS/JSでRemotionと同等の動きを再現（opacity + transform）


## 3. ユーザーのタイミングデータ形式

```
スライド 1:  0:21.74（音声 0:20.99 + 後0.75秒）
スライド 2:  0:33.29（前0.75秒 + 音声 0:31.79 + 後0.75秒）
スライド 3:  0:42.39（前0.75秒 + 音声 0:40.89 + 後0.75秒）
...
```

パース方法:
- 「スライド N:」の後の最初の `M:SS.ss` 形式の時間を取得
- 分:秒を秒に変換
- これが `duration_sec`（パディング込みの値をそのまま使う）


## 4. ラベリングルール（JS移植元）

### 4.1 テキストなしシェイプ

```javascript
// Python版 assign_label_by_position の移植
function labelByPosition(shape) {
  const topPct = (shape.y / 1080) * 100;
  const wPct = (shape.w / 1920) * 100;
  const hPct = (shape.h / 1080) * 100;

  if (shape.is_picture) {
    if (topPct > 93 || topPct < 2) return "ACCENT_SHAPE";
    if (shape.w > 800 && shape.h > 400) return "CHART_IMAGE";
    if (topPct > 75 && topPct < 90) return "BOTTOM_TAKEAWAY_ICON";
    return "CONTENT_ICON";
  }
  if (!shape.has_text || !shape.text) {
    if (wPct > 95 && hPct > 95) return "BG_FILL";
    if (topPct < 1 && hPct < 7 && wPct > 85) return "HEADER_STRIPE";
    if (topPct > 92 && hPct < 7 && wPct > 85) return "FOOTER_STRIPE";
    if (hPct < 2 && topPct > 14 && topPct < 22 && wPct > 45) return "TITLE_LINE";
    if (topPct > 74 && topPct < 88 && hPct > 5 && hPct < 16 && wPct > 65) return "BOTTOM_BAR";
    if (hPct < 2 && topPct > 18 && topPct < 82 && wPct > 45) return "LIST_DIVIDER";
    return "ACCENT_SHAPE";
  }
  // テキストありの場合は別関数へ
}
```

### 4.2 テキストありシェイプ

```javascript
function labelByTextAndPosition(shape, hasListItems) {
  const text = shape.text.trim();
  const topPct = (shape.y / 1080) * 100;
  const wPct = (shape.w / 1920) * 100;

  if (/^\d+\s*\/\s*\d+$/.test(text) && topPct > 88) return "PAGE_NUMBER";
  if (topPct < 18 && wPct > 40) return "SLIDE_TITLE";
  if (/出典|参考|引用/.test(text)) return "SOURCE_CITATION";
  if (/^\d$/.test(text) && shape.w < 120) return "LIST_NUMBER";
  if (/^0\d$/.test(text) && shape.w < 120) return "LIST_NUMBER";
  if (topPct > 74 && topPct < 90 && wPct > 40) return "BOTTOM_TAKEAWAY";
  if (hasListItems && topPct > 15 && topPct < 85) {
    if (text.length < 25 && shape.fontSize >= 14) return "LIST_HEADING";
    return "LIST_BODY";
  }
  return "BODY_PARAGRAPH";
}
```

### 4.3 アニメーションルール

```javascript
const ANIMATION_RULES = {
  // 背景層: null → slides.json に含めない
  BG_FILL: null, HEADER_STRIPE: null, FOOTER_STRIPE: null,
  TITLE_LINE: null, BOTTOM_BAR: null, LIST_DIVIDER: null,
  CONTENT_AREA_BG: null, ACCENT_SHAPE: null,
  // コンテンツ層
  COVER_TITLE:    { type: "fadeIn",       delay: 0.0,  duration: 0.6 },
  SLIDE_TITLE:    { type: "fadeIn",       delay: 0.0,  duration: 0.4 },
  BODY_PARAGRAPH: { type: "fadeIn",       delay: 1.0,  duration: 0.6 },
  LIST_NUMBER:    { type: "scaleIn",      delay: null, duration: 0.3 },
  LIST_HEADING:   { type: "slideInLeft",  delay: null, duration: 0.4 },
  LIST_BODY:      { type: "fadeIn",       delay: null, duration: 0.4 },
  SOURCE_CITATION:{ type: "fadeIn",       delay: null, duration: 0.3 },
  BOTTOM_TAKEAWAY:{ type: "slideInBottom",delay: null, duration: 0.5 },
  PAGE_NUMBER:    { type: "fadeIn",       delay: 0.0,  duration: 0.2 },
  // ビジュアル層
  CONTENT_ICON:         { type: "scaleIn", delay: null, duration: 0.4 },
  BOTTOM_TAKEAWAY_ICON: { type: "scaleIn", delay: null, duration: 0.3 },
  LOGO:                 { type: "fadeIn",  delay: 1.0,  duration: 0.5 },
  CHART_IMAGE:          { type: "fadeIn",  delay: null, duration: 0.5 },
};
```

### 4.4 delay動的計算

仕様書セクション3.6の `calculate_delays` を参照。要点:
- **リスト:** LIST_NUMBERをy座標ソート → BASE_DELAY=1.0 + i*STAGGER=1.2 で stagger。同じy座標のLIST_HEADING同時、LIST_BODYは+0.3s
- **横並びリスト:** y座標が近い場合（差30px以内）はx座標順にソート
- **CONTENT_ICON:** 最も近いテキスト要素と同じdelay
- **BOTTOM_TAKEAWAY:** 文字数から読み時間を逆算（日本語4文字/秒 + 余白1秒）、`duration - readTime`
- **SOURCE_CITATION:** 直上テキスト要素のdelay + duration + 0.5s
- **残りのnull:** デフォルト1.0s


## 5. PPTX XMLパースの要点

### 5.1 使用ライブラリ

```
npm install jszip
```

### 5.2 名前空間

```javascript
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
```

### 5.3 スライドサイズ取得

```xml
<!-- ppt/presentation.xml -->
<p:sldSz cx="9144000" cy="5143500" />
```

### 5.4 シェイプ抽出（各slideN.xml）

```xml
<p:spTree>
  <p:sp>             <!-- 通常シェイプ -->
    <p:nvSpPr><p:cNvPr id="4" name="TextBox 3"/></p:nvSpPr>
    <p:spPr>
      <a:xfrm>
        <a:off x="762000" y="533400"/>   <!-- 左上座標（EMU） -->
        <a:ext cx="8382000" cy="685800"/> <!-- 幅・高さ（EMU） -->
      </a:xfrm>
    </p:spPr>
    <p:txBody>
      <a:p>
        <a:r>
          <a:rPr lang="ja-JP" sz="2400" b="1">
            <a:solidFill><a:srgbClr val="2C3E50"/></a:solidFill>
          </a:rPr>
          <a:t>テキスト内容</a:t>
        </a:r>
      </a:p>
    </p:txBody>
  </p:sp>
  <p:pic>             <!-- 画像シェイプ -->
  <p:grpSp>           <!-- グループシェイプ → 子を展開 -->
</p:spTree>
```

### 5.5 グループシェイプの座標変換

```
子の実座標 = (子のoff - グループのchOff) + グループのoff
```

`a:xfrm` 内の `a:chOff`（子要素座標系の原点）と `a:off`（グループ自体の位置）を使って変換。


## 6. slides.json の出力形式

Phase 1のRemotionが読む形式と同一。型定義は `remotion/src/types.ts` を参照。

```json
{
  "meta": {
    "source_file": "filename.pptx",
    "total_slides": 10,
    "output_width": 1920,
    "output_height": 1080,
    "fps": 30
  },
  "slides": [
    {
      "slide_index": 0,
      "slide_type": "cover",
      "duration": 21.74,
      "background": { "src": "slides/slide_01_bg.png" },
      "audio": { "src": "audio/slide_01.wav", "duration_sec": 20.99, "offset_sec": 0.5 },
      "elements": [
        {
          "id": "s01_el_01",
          "label": "COVER_TITLE",
          "type": "richText",
          "x": 140, "y": 280, "w": 760, "h": 200,
          "text": "タイトルテキスト",
          "fontSize": 38,
          "fontColor": "#333333",
          "fontWeight": "bold",
          "lineHeight": 1.5,
          "animation": { "type": "fadeIn", "delay": 0.0, "duration": 0.6 }
        }
      ]
    }
  ]
}
```


## 7. 技術スタック

```
webapp/
├── package.json          # Vite + React + TypeScript
├── vite.config.ts
├── tsconfig.json
├── index.html
├── netlify.toml          # SPA用リダイレクト設定
├── src/
│   ├── main.tsx
│   ├── App.tsx           # ルーティング（setup / editor）
│   ├── pages/
│   │   ├── SetupPage.tsx
│   │   └── EditorPage.tsx
│   ├── components/
│   │   ├── SlidePreview.tsx
│   │   ├── Timeline.tsx
│   │   ├── PropertyPanel.tsx
│   │   └── PlaybackControls.tsx
│   ├── lib/
│   │   ├── pptxParser.ts       # JSZip + DOMParser
│   │   ├── timingParser.ts     # 秒数テキストのパース
│   │   ├── narrationParser.ts  # ナレーション分割
│   │   ├── labeler.ts          # ルールベースラベリング
│   │   ├── animationAssigner.ts # アニメーション割り当て + delay計算
│   │   └── mergeSlides.ts      # 全体のマージ → slides.json生成
│   ├── types/
│   │   └── slides.ts           # remotion/src/types.ts と同じ型定義
│   └── styles/
│       └── global.css
└── public/
```

### 依存パッケージ

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "jszip": "^3.10"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4",
    "typescript": "^5",
    "vite": "^5"
  }
}
```

### netlify.toml

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```


## 8. ユーザー環境・注意事項

- **本業:** 産業医（エンジニアではない）
- **スキル:** コードは書かないが、AIに指示してツール構築・運用
- **デプロイ経験:** GitHub push → Netlify自動デプロイ
- **OS:** Windows、PowerPointインストール済み
- **1ステップずつ確認しながら進める**のが安全

### 8.1 Webアプリの使い方フロー（ユーザー視点）

1. Windows環境で `export_slides.py` と `export_icons.py` を実行 → PNG生成（COM必須）
2. Webアプリを開く
3. PPTXファイル、秒数データ、ナレーション原稿、音声ファイルを入力
4. 「解析開始」→ エディタでプレビュー確認、タイミング微調整
5. 「JSON出力」→ slides.json をダウンロード
6. ダウンロードした slides.json を `video_making/data/` に配置
7. `cd remotion && npx remotion render ...` → MP4出力


## 9. 参照ファイル

実装時に参照すべき既存ファイル:

| ファイル | 参照目的 |
|---------|---------|
| `scripts/extract_shapes.py` | PPTXパースのPython実装。JS移植の元ネタ |
| `scripts/merge_and_assign.py` | ラベリング・delay計算のPython実装。JS移植の元ネタ |
| `scripts/constants.py` | EMU→px変換式 |
| `remotion/src/types.ts` | slides.jsonの型定義（Webアプリ側でも同じ型を使う） |
| `data/slides.json` | 実際の出力例（10スライド分） |
| `data/raw_shapes.json` | extract_shapes.py の実出力（200シェイプ） |
| `data/audio_timing.json` | タイミングデータの実例 |
