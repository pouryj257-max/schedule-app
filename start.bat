@echo off
chcp 65001 >nul
echo ==============================
echo   일정관리 앱 시작
echo ==============================
echo.

cd /d "%~dp0"

:: 필요한 패키지 설치 확인
pip install flask openpyxl >nul 2>&1

echo 서버를 시작합니다...
echo.
echo  [로컬 접속]
echo  - PC:     http://127.0.0.1:5000
echo.
echo  [로그인 정보]
echo  - 관리자: admin / admin
echo  - 사용자: 사번 / 사번
echo.
echo  종료하려면 이 창에서 Ctrl+C 를 누르세요
echo ==============================
echo.

start "" python app.py
timeout /t 3 /nobreak >nul

echo.
echo  외부 공개 URL을 생성합니다 (Cloudflare Tunnel)...
echo  잠시 기다려주세요...
echo.

"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe" tunnel --url http://localhost:5000
pause
