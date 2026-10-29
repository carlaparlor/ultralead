# CI acceptance test: install and launch the actual EXEs with Node removed from PATH.
$ErrorActionPreference = 'Stop'
$node = (Get-Command node).Source
$oldPath = $env:Path
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('ultralead-install-' + [Guid]::NewGuid())
$installDirectory = Join-Path $temporary 'Installed app'
$portableProfile = Join-Path $temporary 'Portable workspace'
$setup = @(Get-ChildItem 'release/ultralead-plus-Setup-*.exe')
$portable = @(Get-ChildItem 'release/ultralead-plus-Portable-*.exe')
if ($setup.Count -ne 1 -or $portable.Count -ne 1) { throw 'Expected one Setup EXE and one Portable EXE.' }
$launcher = $null

try {
    $env:Path = Join-Path $env:SystemRoot 'System32'
    # NSIS requires /D to be the last parameter, without quotes even for spaces.
    $installer = Start-Process -FilePath $setup[0].FullName -ArgumentList "/S /D=$installDirectory" -Wait -PassThru
    if ($installer.ExitCode -ne 0) { throw "Installer failed: $($installer.ExitCode)" }
    $executable = Join-Path $installDirectory 'ultralead-plus.exe'
    if (-not (Test-Path $executable)) { throw 'Installer did not create the application executable.' }
    foreach ($folder in @('DesktopDirectory', 'Programs')) {
        $shortcut = Join-Path ([Environment]::GetFolderPath($folder)) 'ultralead+.lnk'
        if (-not (Test-Path $shortcut)) { throw "Missing shortcut: $shortcut" }
    }

    # The test harness uses its absolute Node path; the app itself cannot find Node.
    & $node 'scripts/smoke-desktop.mjs' --executable $executable
    if ($LASTEXITCODE -ne 0) { throw 'Installed app smoke test failed.' }

    # The portable wrapper extracts to TEMP and starts the same offline application.
    # Its own lifetime includes the child app, so check the real visible window.
    $launcher = Start-Process -FilePath $portable[0].FullName -ArgumentList "--user-data-dir=`"$portableProfile`"" -PassThru
    $window = $null
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ([DateTime]::UtcNow -lt $deadline) {
        $window = Get-Process -Name 'ultralead-plus' -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq 'ultralead+' } |
            Select-Object -First 1
        if ($window) { break }
        if ($launcher.HasExited) { throw "Portable EXE exited before opening: $($launcher.ExitCode)" }
        Start-Sleep -Milliseconds 500
    }
    if (-not $window) { throw 'Portable EXE did not open its application window.' }
    if (-not (Test-Path $portableProfile)) { throw 'Portable app did not create its workspace.' }
    [void]$window.CloseMainWindow()
    if (-not $launcher.WaitForExit(15000)) { throw 'Portable EXE did not close cleanly.' }
    if ($launcher.ExitCode -ne 0) { throw "Portable EXE failed: $($launcher.ExitCode)" }
    Write-Host 'Windows acceptance passed: one-click installer, shortcuts and portable launch without Node on PATH.'
} finally {
    $env:Path = $oldPath
    if ($launcher -and -not $launcher.HasExited) { $launcher.Kill($true); $launcher.WaitForExit() }
    $uninstaller = Join-Path $installDirectory 'Uninstall ultralead-plus.exe'
    if (Test-Path $uninstaller) {
        $uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S _?=$installDirectory" -Wait -PassThru
        if ($uninstall.ExitCode -ne 0) { Write-Warning "Uninstaller exit code: $($uninstall.ExitCode)" }
    }
    if (Test-Path $temporary) { Remove-Item $temporary -Recurse -Force }
}
