$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskBackup = (Get-Content -LiteralPath (Join-Path $taskRoot 'backup-path.txt') -Raw).Trim()
$taskSettingsPath = Join-Path $env:APPDATA 'Code\User\settings.json'
$taskBefore = Get-Content -LiteralPath (Join-Path $taskBackup 'settings.json') -Raw | ConvertFrom-Json
$taskCurrent = Get-Content -LiteralPath $taskSettingsPath -Raw | ConvertFrom-Json
$taskKeys = Get-Content -LiteralPath (Join-Path $taskRoot 'changed-settings.json') -Raw | ConvertFrom-Json
foreach ($taskKey in $taskKeys) {
    $taskOldProperty = $taskBefore.PSObject.Properties[$taskKey]
    if ($null -ne $taskOldProperty) {
        $taskCurrent | Add-Member -NotePropertyName $taskKey -NotePropertyValue $taskOldProperty.Value -Force
    } else {
        $taskCurrent.PSObject.Properties.Remove($taskKey)
    }
}
$taskJson = ($taskCurrent | ConvertTo-Json -Depth 100) + [Environment]::NewLine
[System.IO.File]::WriteAllText($taskSettingsPath, $taskJson, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'Restored the appearance settings changed by this task. Other settings were preserved.'
