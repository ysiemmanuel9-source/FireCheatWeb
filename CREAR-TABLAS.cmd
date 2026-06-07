@echo off
setlocal
cd /d "%~dp0"
echo Creando/actualizando la base de datos Fire Cheat...
cmd /c npm run setup-db
pause
endlocal
