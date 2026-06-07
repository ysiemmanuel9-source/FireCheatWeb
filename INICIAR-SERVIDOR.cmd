@echo off
setlocal
cd /d "%~dp0"
echo Iniciando Fire Cheat con backend, MySQL y panel admin...
echo Verificando la base de datos...
cmd /c npm run setup-db
if errorlevel 1 (
  echo No se pudo preparar MySQL. Revisa el archivo .env.
  pause
  exit /b 1
)
echo.
echo Pagina: http://localhost:3001
echo Panel:  http://localhost:3001/admin.html
cmd /c npm start
pause
endlocal
