' Hidden launcher for My Office Unattended Trial Monitor
' Runs start-unattended.cmd with window style 0 (completely hidden)
Option Explicit

Dim oShell, oFso, sScriptDir, sRootDir, sCmdPath
Set oShell = CreateObject("WScript.Shell")
Set oFso = CreateObject("Scripting.FileSystemObject")

' Get directory containing this script (scripts\) and parent repository root
sScriptDir = oFso.GetParentFolderName(WScript.ScriptFullName)
sRootDir = oFso.GetParentFolderName(sScriptDir)

If sRootDir = "" Or Not oFso.FolderExists(sRootDir) Then
    sRootDir = "D:\somehting code\my-office"
End If

sCmdPath = Chr(34) & sRootDir & "\scripts\start-unattended.cmd" & Chr(34)

oShell.CurrentDirectory = sRootDir
oShell.Run "%comspec% /c " & sCmdPath, 0, False

Set oFso = Nothing
Set oShell = Nothing

