@echo off
chcp 65001 >nul
setlocal

set PPTX_FILE=%1
if "%PPTX_FILE%"=="" (
    echo 使い方: run_pipeline.bat input.pptx
    exit /b 1
)

echo ============================================
echo  PPTX → Remotion 動画変換パイプライン
echo ============================================
echo.

echo [1/7] シェイプ抽出...
python scripts\extract_shapes.py %PPTX_FILE% data
if errorlevel 1 goto :error

echo.
echo [2/7] スライドPNG書き出し (PowerPoint COM)...
python scripts\export_slides.py %PPTX_FILE%
if errorlevel 1 goto :error

echo.
echo [3/7] アイコン書き出し...
python scripts\export_icons.py %PPTX_FILE%
if errorlevel 1 goto :error

echo.
echo [4/7] Vision APIラベリング...
echo     (ANTHROPIC_API_KEY が設定されていることを確認)
python scripts\label_elements.py
if errorlevel 1 goto :error

echo.
echo [5/7] ラベル確認 (初回のみ)...
python scripts\verify_labels.py
echo.
echo     → 修正が必要な場合は data\labeled_elements.json を編集してください
echo     → 問題なければ何かキーを押して続行...
pause >nul

echo.
echo [6/7] マージ＆アニメーション割り当て...
python scripts\merge_and_assign.py
if errorlevel 1 goto :error

echo.
echo [7/7] Remotionレンダリング...

REM assetsフォルダをpublicにリンク（初回のみ）
if not exist remotion\public\slides (
    mklink /D remotion\public\slides ..\assets\slides
)
if not exist remotion\public\icons (
    mklink /D remotion\public\icons ..\assets\icons
)
if not exist remotion\public\audio (
    mklink /D remotion\public\audio ..\assets\audio
)

cd remotion
call npx remotion render src/Root.tsx SlideShow out/video.mp4 --codec h264 --pixel-format yuv420p --crf 18
if errorlevel 1 goto :error
cd ..

echo.
echo ============================================
echo  完了！ remotion\out\video.mp4 が生成されました
echo ============================================
exit /b 0

:error
echo.
echo [エラー] 処理中にエラーが発生しました
exit /b 1
