param(
  [string]$Package,
  [string]$Project = '.',
  [ValidateSet('codex', 'kiro', 'both')][string]$AgentHost = 'both',
  [string]$WorkspaceFile = 'diagram.marmerlade.json',
  [string]$ServerName = 'marmerlade',
  [switch]$NoBrowser,
  [switch]$Replace
)
$ErrorActionPreference = 'Stop'
$marmerladeData = Join-Path $env:LOCALAPPDATA 'Marmerlade'
$marmerladeNode = Get-Command node -ErrorAction SilentlyContinue
$marmerladeCompatible = $false
if ($marmerladeNode -and (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  & node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=12?0:1)'
  $marmerladeCompatible = $LASTEXITCODE -eq 0
}
if (-not $marmerladeCompatible) {
  $marmerladeArch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64') { 'arm64' } else { 'x64' }
  $marmerladeTemp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $marmerladeTemp | Out-Null
  try {
    $marmerladeSums = (Invoke-WebRequest 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt' -TimeoutSec 180).Content
    $marmerladeMatch = [regex]::Match($marmerladeSums, "(?m)^([0-9a-f]{64})\s+(node-v22\.\d+\.\d+-win-$marmerladeArch\.zip)\s*$")
    if (-not $marmerladeMatch.Success) { throw 'No supported Node.js release found.' }
    $marmerladeArchive = $marmerladeMatch.Groups[2].Value
    $marmerladeZip = Join-Path $marmerladeTemp 'node.zip'
    Invoke-WebRequest "https://nodejs.org/dist/latest-v22.x/$marmerladeArchive" -OutFile $marmerladeZip -TimeoutSec 180
    if ((Get-FileHash $marmerladeZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $marmerladeMatch.Groups[1].Value) { throw 'Node.js checksum verification failed.' }
    $marmerladeRuntime = Join-Path $marmerladeData 'runtime'
    Expand-Archive $marmerladeZip -DestinationPath $marmerladeRuntime -Force
    $env:Path = (Join-Path $marmerladeRuntime ($marmerladeArchive -replace '\.zip$', '')) + ';' + $env:Path
  } finally { Remove-Item $marmerladeTemp -Recurse -Force }
}
if ($Package) {
  $marmerladeInstall = Join-Path $marmerladeData 'app'
  & npm.cmd install --prefix $marmerladeInstall --no-audit --no-fund -- $Package
  if ($LASTEXITCODE -ne 0) { throw 'Package installation failed.' }
  $marmerladeCli = Join-Path $marmerladeInstall 'node_modules/marmerlade/dist/cli.js'
} else {
  $marmerladeSource = Split-Path $PSScriptRoot -Parent
  if (-not (Test-Path (Join-Path $marmerladeSource 'src/main.tsx'))) { throw 'Supply -Package with a trusted release tarball.' }
  & npm.cmd --prefix $marmerladeSource ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  & npm.cmd --prefix $marmerladeSource run build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
  $marmerladeCli = Join-Path $marmerladeSource 'dist/cli.js'
}
$marmerladeArguments = @($marmerladeCli, 'setup', '--project', $Project, '--host', $AgentHost, '--file', $WorkspaceFile, '--name', $ServerName)
if ($NoBrowser) { $marmerladeArguments += '--no-browser' }
if ($Replace) { $marmerladeArguments += '--replace' }
& node @marmerladeArguments
if ($LASTEXITCODE -ne 0) { throw 'Marmerlade setup failed.' }
