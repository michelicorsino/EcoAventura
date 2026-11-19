@echo off
rem ==========================================================================
rem  EcoAventura - inicia o jogo completo em http://localhost:8000
rem  (site + API + CNN num unico endereco, que o Cloudflare Tunnel publica)
rem
rem  Uso:  iniciar_servidor.bat              -> inicia (constroi o site se faltar)
rem        iniciar_servidor.bat --construir  -> reconstroi o site antes de iniciar
rem ==========================================================================
cd /d "%~dp0"

if "%1"=="--construir" goto construir
if not exist "frontend\dist\index.html" goto construir
goto iniciar

:construir
echo Construindo o site do jogo...
pushd frontend
call npm run build
if errorlevel 1 (
  echo Falha ao construir o site.
  popd
  pause
  exit /b 1
)
popd

:iniciar
rem Publicado na internet: so aceita classificar fotos do proprio jogo (por id)
set ECO_PERMITIR_UPLOAD=0
set ECO_TF_THREADS=2
echo.
echo EcoAventura rodando em http://localhost:8000  (feche esta janela para parar)
echo.
cd backend
".venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1
