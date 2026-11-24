' Hidden launcher for My Office Watchdog Trial Monitor
' Runs watchdog-trial-monitor.ps1 with window style 0 (completely hidden)
Option Explicit

Dim oShell, oFso, sScriptDir, sRootDir, sCmd
Set oShell = CreateObject("WScript.Shell")
Set oFso = CreateObject("Scripting.FileSystemObject")

sScriptDir = oFso.GetParentFolderName(WScript.ScriptFullName)
sRootDir = oFso.GetParentFolderName(sScriptDir)

If sRootDir = "" Or Not oFso.FolderExists(sRootDir) Then
    sRootDir = "D:\somehting code\my-office"
End If

sCmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File " & Chr(34) & sRootDir & "\scripts\watchdog-trial-monitor.ps1" & Chr(34)

oShell.CurrentDirectory = sRootDir
oShell.Run sCmd, 0, True

Set oFso = Nothing
Set oShell = Nothing

