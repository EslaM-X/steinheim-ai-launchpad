@echo off
title Steinheim - restore on this machine
REM One button on a new machine.
REM
REM After cloning the repository and copying the steinheim-move folder across,
REM double-click this. It finds the bundle, puts the secrets and the automation
REM data back, and starts everything.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\restore.ps1"
