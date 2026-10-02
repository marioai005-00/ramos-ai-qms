@echo off
chcp 65001 >nul
title RAMOS AI-QMS 8D - 1-Click Checkpoint Restore
color 0b
echo =====================================================================
echo  🔄 RAMOS AI-QMS 8D - 1-Click Instant Checkpoint Restore
echo  체크포인트: Phase 1 Gold Baseline (v1.0.0-gold-checkpoint)
echo =====================================================================
echo.
echo  현재 작업을 1~3순위 완성 및 헤더 최적화 시점으로 즉시 복구합니다.
echo.
echo  [1] Git 기반 즉시 롤백 (v1.0.0-gold-checkpoint 태그 체크아웃)
echo  [2] 물리적 스냅샷 파일 100%% 복원 (Git 미사용 환경에서도 안전 복구)
echo  [3] 취소 / 종료
echo.
set /p choice="원하시는 복구 방식을 입력하세요 (1, 2, 또는 3): "

if "%choice%"=="1" goto git_restore
if "%choice%"=="2" goto file_restore
if "%choice%"=="3" goto exit

:git_restore
echo.
echo [Git 롤백 진행 중...]
git reset --hard HEAD
git clean -fd
git checkout v1.0.0-gold-checkpoint
echo.
echo =====================================================================
echo  ✅ Git 체크포인트(v1.0.0-gold-checkpoint)로 성공적으로 복구되었습니다!
echo =====================================================================
pause
goto exit

:file_restore
echo.
echo [물리적 스냅샷 복원 진행 중...]
python scripts\restore_checkpoint.py 2
echo.
pause
goto exit

:exit
