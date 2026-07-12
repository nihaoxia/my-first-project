param(
    [int]$TimeoutSeconds = 900,
    [switch]$Pause
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$stamp] $Message"
    Write-Host $line
    if ($script:LogPath) {
        $line | Out-File -LiteralPath $script:LogPath -Append -Encoding UTF8
    }
    try {
        [Console]::Out.Flush()
    } catch {
    }
}

trap {
    $message = "FATAL: $($_.Exception.Message)"
    try {
        Write-Step $message
        if ($script:BackupRoot) {
            $fatalPath = Join-Path $script:BackupRoot "fatal-error.txt"
            $details = @(
                $message
                ""
                "Position:"
                $_.InvocationInfo.PositionMessage
                ""
                "ScriptStackTrace:"
                $_.ScriptStackTrace
            ) -join [Environment]::NewLine
            $details | Set-Content -LiteralPath $fatalPath -Encoding UTF8
            Write-Step "Fatal error written to: $fatalPath"
        }
    } catch {
    }
    break
}

function New-DirectoryIfMissing {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Get-CodexUiProcesses {
    Get-CimInstance Win32_Process -Filter "Name = 'Codex.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $path = [string]$_.ExecutablePath
            $commandLine = [string]$_.CommandLine
            $isCodexPackageUi = $path -like "*\WindowsApps\OpenAI.Codex_*" -and $path -like "*\app\Codex.exe"
            $isPlainUi = $path -like "*\app\Codex.exe" -and $commandLine -notmatch "app-server|crashpad|manager"
            $isCodexPackageUi -or $isPlainUi
        }
}

function Wait-ForCodexUiExit {
    param([int]$TimeoutSeconds)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ($true) {
        $processes = @(Get-CodexUiProcesses)
        if ($processes.Count -eq 0) {
            Write-Step "Codex UI process is not running."
            return
        }

        if ((Get-Date) -gt $deadline) {
            $ids = ($processes | ForEach-Object { $_.ProcessId }) -join ", "
            throw "Timed out waiting for Codex UI process to exit. Still running PID(s): $ids"
        }

        $ids = ($processes | ForEach-Object { $_.ProcessId }) -join ", "
        Write-Step "Waiting for Codex UI process to exit. PID(s): $ids"
        Start-Sleep -Seconds 3
    }
}

function Move-ToBackup {
    param(
        [string]$SourcePath,
        [string]$BackupRoot,
        [string]$BackupName
    )

    if (-not (Test-Path -LiteralPath $SourcePath)) {
        Write-Step "Skip missing path: $SourcePath"
        return $null
    }

    New-DirectoryIfMissing -Path $BackupRoot
    $target = Join-Path $BackupRoot $BackupName
    $suffix = 1
    while (Test-Path -LiteralPath $target) {
        $target = Join-Path $BackupRoot ("{0}-{1}" -f $BackupName, $suffix)
        $suffix++
    }

    Write-Step "Moving path to backup: $SourcePath"
    Move-Item -LiteralPath $SourcePath -Destination $target
    Write-Step "Moved to backup: $SourcePath -> $target"
    return $target
}

function Copy-ToBackup {
    param(
        [string]$SourcePath,
        [string]$BackupRoot,
        [string]$BackupName
    )

    if (-not (Test-Path -LiteralPath $SourcePath)) {
        Write-Step "Skip missing path: $SourcePath"
        return $null
    }

    New-DirectoryIfMissing -Path $BackupRoot
    $target = Join-Path $BackupRoot $BackupName
    $suffix = 1
    while (Test-Path -LiteralPath $target) {
        $target = Join-Path $BackupRoot ("{0}-{1}" -f $BackupName, $suffix)
        $suffix++
    }

    Write-Step "Copying path to backup: $SourcePath"
    Copy-Item -LiteralPath $SourcePath -Destination $target -Recurse -Force
    Write-Step "Copied to backup: $SourcePath -> $target"
    return $target
}

function Set-PropertyValue {
    param(
        [psobject]$Object,
        [string]$Name,
        $Value
    )

    if ($Object.PSObject.Properties.Name -contains $Name) {
        $Object.$Name = $Value
    } else {
        $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value
    }
}

function Set-HardwareAccelerationDisabled {
    param(
        [string]$LocalStatePath,
        [string]$BackupRoot
    )

    if (-not (Test-Path -LiteralPath $LocalStatePath)) {
        Write-Step "Local State not found: $LocalStatePath"
        return $false
    }

    Copy-ToBackup -SourcePath $LocalStatePath -BackupRoot $BackupRoot -BackupName "Local State.before.json" | Out-Null

    Write-Step "Updating Local State: $LocalStatePath"
    $jsonText = Get-Content -Raw -LiteralPath $LocalStatePath
    $json = $jsonText | ConvertFrom-Json

    if (-not ($json.PSObject.Properties.Name -contains "hardware_acceleration_mode") -or $null -eq $json.hardware_acceleration_mode) {
        Set-PropertyValue -Object $json -Name "hardware_acceleration_mode" -Value ([pscustomobject]@{})
    }

    Set-PropertyValue -Object $json.hardware_acceleration_mode -Name "enabled" -Value $false
    Set-PropertyValue -Object $json -Name "hardware_acceleration_mode_previous" -Value $false

    $json | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $LocalStatePath -Encoding UTF8
    Write-Step "Disabled hardware acceleration in Local State."
    return $true
}

function Set-BundledContentVariant {
    param([string]$PluginJsonPath)

    if (-not (Test-Path -LiteralPath $PluginJsonPath)) {
        Write-Step "Plugin json not found: $PluginJsonPath"
        return $false
    }

    Write-Step "Updating plugin variant: $PluginJsonPath"
    $plugin = Get-Content -Raw -LiteralPath $PluginJsonPath | ConvertFrom-Json
    Set-PropertyValue -Object $plugin -Name "bundledContentVariant" -Value "multi-tab"
    $plugin | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $PluginJsonPath -Encoding UTF8
    Write-Step "Set bundledContentVariant=multi-tab: $PluginJsonPath"
    return $true
}

function Reinstall-BrowserPluginCache {
    param(
        [string]$CacheRoot,
        [string]$SourceRoot,
        [string]$BackupRoot
    )

    if (-not (Test-Path -LiteralPath $SourceRoot)) {
        throw "Bundled browser plugin source does not exist: $SourceRoot"
    }

    $sourcePluginJson = Join-Path $SourceRoot ".codex-plugin\plugin.json"
    if (-not (Test-Path -LiteralPath $sourcePluginJson)) {
        throw "Bundled browser plugin source plugin.json does not exist: $sourcePluginJson"
    }

    Copy-ToBackup -SourcePath $sourcePluginJson -BackupRoot $BackupRoot -BackupName "source-plugin.before.json" | Out-Null
    Set-BundledContentVariant -PluginJsonPath $sourcePluginJson | Out-Null

    Move-ToBackup -SourcePath $CacheRoot -BackupRoot $BackupRoot -BackupName "plugin-cache-browser" | Out-Null

    $sourcePlugin = Get-Content -Raw -LiteralPath $sourcePluginJson | ConvertFrom-Json
    $version = [string]$sourcePlugin.version
    if ([string]::IsNullOrWhiteSpace($version)) {
        throw "Bundled browser plugin source has no version in plugin.json."
    }

    New-DirectoryIfMissing -Path $CacheRoot
    $destinationRoot = Join-Path $CacheRoot $version
    Write-Step "Copying bundled browser plugin source to cache: $SourceRoot -> $destinationRoot"
    Copy-Item -LiteralPath $SourceRoot -Destination $destinationRoot -Recurse -Force
    Set-BundledContentVariant -PluginJsonPath (Join-Path $destinationRoot ".codex-plugin\plugin.json") | Out-Null

    Write-Step "Reinstalled bundled browser plugin cache: $destinationRoot"
    return $destinationRoot
}

function Reset-UserBrowserDirectory {
    param(
        [string]$BrowserRoot,
        [string]$BackupRoot
    )

    Move-ToBackup -SourcePath $BrowserRoot -BackupRoot $BackupRoot -BackupName "user-browser" | Out-Null
    New-DirectoryIfMissing -Path $BrowserRoot
    New-DirectoryIfMissing -Path (Join-Path $BrowserRoot "sessions")

    $configPath = Join-Path $BrowserRoot "config.toml"
    Write-Step "Writing browser config: $configPath"
    'approval_mode = "never_ask"' | Set-Content -LiteralPath $configPath -Encoding ASCII
    Write-Step "Rebuilt user browser directory: $BrowserRoot"
    return $configPath
}

function Read-JsonValue {
    param(
        [string]$Path,
        [scriptblock]$Selector
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $json = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
    return & $Selector $json
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$appDataCodexWeb = Join-Path $env:APPDATA "Codex\web\Codex"
$userCodexRoot = Join-Path $env:USERPROFILE ".codex"
$backupRoot = Join-Path $userCodexRoot ("backups\codex-browser-fix-{0}" -f $timestamp)
$reportPath = Join-Path $backupRoot "repair-report.json"
$script:BackupRoot = $backupRoot
New-DirectoryIfMissing -Path $backupRoot
$script:LogPath = Join-Path $backupRoot "repair.log"

Write-Step "Codex browser repair starting."
Write-Step "Backup root: $backupRoot"
Write-Step "Log: $script:LogPath"

Wait-ForCodexUiExit -TimeoutSeconds $TimeoutSeconds

$movedProfileItems = @()
$profileTargets = @(
    "codex-browser-app",
    "Default",
    "GPUPersistentCache",
    "GrShaderCache",
    "ShaderCache",
    "BrowserMetrics",
    "BrowserMetrics-spare.pma",
    "component_crx_cache",
    "extensions_crx_cache"
)

foreach ($item in $profileTargets) {
    $source = Join-Path $appDataCodexWeb $item
    $backupName = "web-Codex-{0}" -f ($item -replace "[\\/:*?`"<>|]", "_")
    $moved = Move-ToBackup -SourcePath $source -BackupRoot $backupRoot -BackupName $backupName
    if ($null -ne $moved) {
        $movedProfileItems += [pscustomobject]@{
            source = $source
            backup = $moved
        }
    }
}

$localStatePath = Join-Path $appDataCodexWeb "Local State"
$localStateUpdated = Set-HardwareAccelerationDisabled -LocalStatePath $localStatePath -BackupRoot $backupRoot

$cacheRoot = Join-Path $userCodexRoot "plugins\cache\openai-bundled\browser"
$sourceRoot = Join-Path $userCodexRoot ".tmp\bundled-marketplaces\openai-bundled\plugins\browser"
$reinstalledPluginPath = Reinstall-BrowserPluginCache -CacheRoot $cacheRoot -SourceRoot $sourceRoot -BackupRoot $backupRoot

$browserRoot = Join-Path $userCodexRoot "browser"
$browserConfigPath = Reset-UserBrowserDirectory -BrowserRoot $browserRoot -BackupRoot $backupRoot

$sourcePluginJson = Join-Path $sourceRoot ".codex-plugin\plugin.json"
$cachePluginJson = Join-Path $reinstalledPluginPath ".codex-plugin\plugin.json"

$verification = [pscustomobject]@{
    backupRoot = $backupRoot
    movedProfileItems = $movedProfileItems
    localStateUpdated = $localStateUpdated
    localStateHardwareAccelerationEnabled = Read-JsonValue -Path $localStatePath -Selector { param($json) $json.hardware_acceleration_mode.enabled }
    localStateHardwareAccelerationPrevious = Read-JsonValue -Path $localStatePath -Selector { param($json) $json.hardware_acceleration_mode_previous }
    sourcePluginVariant = Read-JsonValue -Path $sourcePluginJson -Selector { param($json) $json.bundledContentVariant }
    cachePluginVariant = Read-JsonValue -Path $cachePluginJson -Selector { param($json) $json.bundledContentVariant }
    browserSessionsExists = Test-Path -LiteralPath (Join-Path $browserRoot "sessions")
    browserConfigPath = $browserConfigPath
    browserConfigText = if (Test-Path -LiteralPath $browserConfigPath) { Get-Content -Raw -LiteralPath $browserConfigPath } else { $null }
    reinstalledPluginPath = $reinstalledPluginPath
    completedAt = (Get-Date).ToString("o")
}

Write-Step "Writing repair report: $reportPath"
$verification | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Step "Repair completed."
Write-Step "Report: $reportPath"
Write-Step "Restart Codex, then open the in-app browser to verify the crash is gone."

if ($Pause) {
    Write-Host ""
    Read-Host "Press Enter to close this window"
}
