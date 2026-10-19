$ErrorActionPreference = 'Stop'
$taskSourceFont = 'C:\Users\15634\AppData\Local\Programs\Trae CN\resources\app\out\vs\workbench\browser\media\JetBrainsMono-VariableFont_wght.ttf'
$taskFontDirectory = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
$taskFontPath = Join-Path $taskFontDirectory 'JetBrainsMono-VariableFont_wght.ttf'
New-Item -ItemType Directory -Path $taskFontDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $taskFontPath)) {
    Copy-Item -LiteralPath $taskSourceFont -Destination $taskFontPath
}
$taskFontsKey = 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
New-Item -Path $taskFontsKey -Force | Out-Null
New-ItemProperty -LiteralPath $taskFontsKey -Name 'JetBrains Mono (TrueType)' -PropertyType String -Value $taskFontPath -Force | Out-Null
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TraeStyleFontRegistration {
    [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern int AddFontResourceEx(string path, uint flags, IntPtr reserved);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, UIntPtr wparam, IntPtr lparam, uint flags, uint timeout, out UIntPtr result);
}
'@
$taskRegistered = [TraeStyleFontRegistration]::AddFontResourceEx($taskFontPath, 0, [IntPtr]::Zero)
$taskBroadcastResult = [UIntPtr]::Zero
[void][TraeStyleFontRegistration]::SendMessageTimeout([IntPtr]0xffff, 0x001D, [UIntPtr]::Zero, [IntPtr]::Zero, 2, 1000, [ref]$taskBroadcastResult)
Write-Output "JetBrains Mono registered: $taskRegistered font faces. Path: $taskFontPath"
