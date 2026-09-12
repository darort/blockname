@echo off
cd /d "%~dp0"
echo Installing required libraries for Helper Server...
pip install flask openpyxl pillow pywin32 reportlab
echo.
echo All libraries installed successfully! You can now run start_helper_window.bat
pause