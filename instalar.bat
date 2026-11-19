@echo off
rem ==========================================================================
rem  EcoAventura - instalacao no Windows
rem  Uso (na pasta do projeto):  instalar.bat
rem  Cria o ambiente Python do servidor, instala as dependencias do site
rem  e constroi o jogo. Depois, rode:  iniciar_servidor.bat
rem ==========================================================================
setlocal
cd /d "%~dp0"

rem 1) Python 3.10 a 3.13 (o TensorFlow 2.21 nao tem pacote para 3.14)
set "PY="
for %%V in (3.12 3.13 3.11 3.10) do (
  if not defined PY (
    py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V"
  )
)
if not defined PY (
  python -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,13) else 1)" >nul 2>&1 && set "PY=python"
)
if not defined PY (
  echo ERRO: instale o Python 3.10, 3.11, 3.12 ou 3.13 ^(recomendado: 3.12^) em https://www.python.org
  pause
  exit /b 1
)
echo Python encontrado:
%PY% --version

rem 2) Node.js 20 ou mais novo
where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: instale o Node.js 20 ou mais novo em https://nodejs.org
  pause
  exit /b 1
)
node -e "process.exit(parseInt(process.versions.node) >= 20 ? 0 : 1)"
if errorlevel 1 (
  echo ERRO: o Node.js precisa ser a versao 20 ou mais nova.
  pause
  exit /b 1
)

rem 3) Servidor (FastAPI + TensorFlow)
echo.
echo == Instalando o servidor ^(pode demorar: o TensorFlow tem ~500 MB^) ==
%PY% -m venv backend\.venv || goto erro
backend\.venv\Scripts\python.exe -m pip install --upgrade pip || goto erro
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt || goto erro

rem 4) Site (React + Vite)
echo.
echo == Instalando e construindo o site ==
pushd frontend
call npm ci || (popd & goto erro)
call npm run build || (popd & goto erro)
popd

echo.
echo Pronto! Para jogar, rode:  iniciar_servidor.bat
echo e abra http://localhost:8000 no Chrome, Edge ou Firefox.
pause
exit /b 0

:erro
echo.
echo A instalacao falhou. Veja a mensagem acima.
pause
exit /b 1
