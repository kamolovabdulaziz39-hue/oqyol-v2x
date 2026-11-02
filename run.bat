@echo off
cd /d "%~dp0"
title V2X Platform - Google Chrome
echo Starting V2X Platform in Google Chrome...
python main.py
if errorlevel 1 (
    echo [ERROR] Python failed to start!
    pause
)
