@echo off
chcp 65001 >nul
echo ============================================
echo  初回セットアップ
echo ============================================

echo.
echo [1/3] Python パッケージインストール...
pip install python-pptx anthropic Pillow comtypes
if errorlevel 1 (
    echo [WARN] pip install に失敗しました。手動でインストールしてください。
)

echo.
echo [2/3] Remotion npm install...
cd remotion
call npm install
cd ..

echo.
echo [3/3] アセットフォルダのリンク作成...
if not exist remotion\public\slides (
    mklink /D remotion\public\slides ..\..\assets\slides
    echo   slides リンク作成
)
if not exist remotion\public\icons (
    mklink /D remotion\public\icons ..\..\assets\icons
    echo   icons リンク作成
)
if not exist remotion\public\audio (
    mklink /D remotion\public\audio ..\..\assets\audio
    echo   audio リンク作成
)

echo.
echo ============================================
echo  セットアップ完了！
echo  run_pipeline.bat input.pptx で実行できます
echo ============================================
