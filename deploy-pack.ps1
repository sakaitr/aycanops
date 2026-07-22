# deploy-pack.ps1
# VPS deployment tar.gz paketi olusturur
# Kullanim: .\deploy-pack.ps1

$SRC = "c:\Users\Administrator\Desktop\aycanops\aycanops"
$OUT = "c:\Users\Administrator\Desktop\aycanops\aycanops-patch.tar.gz"
$TMP = "c:\Users\Administrator\Desktop\aycanops\_deploy_tmp"

Write-Host "Deployment paketi olusturuluyor..." -ForegroundColor Cyan
Write-Host "  Kaynak : $SRC" -ForegroundColor DarkGray
Write-Host "  Hedef  : $OUT" -ForegroundColor DarkGray
Write-Host ""

$include = @(
  "app",
  "components",
  "hooks",
  "lib",
  "migrations",
  "public",
  "nginx",
  "Dockerfile",
  "docker-compose.yml",
  "next.config.ts",
  "next-env.d.ts",
  "package.json",
  "package-lock.json",
  "postcss.config.mjs",
  "tsconfig.json",
  "eslint.config.mjs",
  "instrumentation.ts",
  "sentry.server.config.ts",
  "sentry.edge.config.ts",
  "sentry.client.config.ts"
)

# .env DAHiL EDiLMiYOR — VPS'tekini koru
# node_modules DAHiL EDiLMiYOR — docker build sirasinda npm ci ile kurulur

# Gecici klasor hazirla
if (Test-Path $TMP) { Remove-Item $TMP -Recurse -Force }
New-Item -ItemType Directory -Path $TMP | Out-Null

$totalFiles = 0

foreach ($item in $include) {
  $fullPath = Join-Path $SRC $item
  if (!(Test-Path $fullPath)) {
    Write-Host "  ATLANDI (bulunamadi): $item" -ForegroundColor Yellow
    continue
  }

  $dest = Join-Path $TMP $item

  if (Test-Path $fullPath -PathType Container) {
    Copy-Item -Path $fullPath -Destination $dest -Recurse -Force
    $count = (Get-ChildItem $dest -Recurse -File).Count
    $totalFiles += $count
    Write-Host "  + $item/ ($count dosya)" -ForegroundColor DarkGray
  } else {
    $destDir = Split-Path $dest -Parent
    if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }
    Copy-Item -Path $fullPath -Destination $dest -Force
    $totalFiles++
    Write-Host "  + $item" -ForegroundColor DarkGray
  }
}

# tar.gz olustur — Windows tar.exe [id] klasorlerini glob olarak atlar, Python tarfile kullan
if (Test-Path $OUT) { Remove-Item $OUT -Force }
$pyScript = @"
import tarfile, os, sys
src = sys.argv[1]; out = sys.argv[2]
with tarfile.open(out, 'w:gz') as t:
    for root, dirs, files in os.walk(src):
        for f in files:
            fp = os.path.join(root, f)
            t.add(fp, arcname=os.path.relpath(fp, src))
print('Tamam:', out)
"@
$pyFile = [System.IO.Path]::GetTempFileName() + ".py"
Set-Content -Path $pyFile -Value $pyScript -Encoding UTF8
python "$pyFile" "$TMP" "$OUT"
Remove-Item $pyFile -Force

# Gecici klasoru temizle
Remove-Item $TMP -Recurse -Force

$size = [math]::Round((Get-Item $OUT).Length / 1MB, 2)
Write-Host ""
Write-Host "Paket hazir: $OUT" -ForegroundColor Green
Write-Host "  $totalFiles dosya, $size MB" -ForegroundColor DarkGray
Write-Host ""
Write-Host "=== VPS'TE YAPILACAKLAR ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. tar.gz'yi VPS'e yukle ve ac:" -ForegroundColor White
Write-Host "     cd /opt/aycanops" -ForegroundColor DarkGray
Write-Host "     tar -xzf aycanops-patch.tar.gz" -ForegroundColor DarkGray
Write-Host ""
Write-Host "2. Image'i olustur:" -ForegroundColor White
Write-Host "     docker build -t aycanops:latest ." -ForegroundColor DarkGray
Write-Host ""
Write-Host "3. Container'i yeniden baslat:" -ForegroundColor White
Write-Host "     docker compose up -d --no-deps app" -ForegroundColor DarkGray
Write-Host ""
Write-Host "4. Loglari izle (migration + baslatma):" -ForegroundColor White
Write-Host "     docker compose logs -f app" -ForegroundColor DarkGray
Write-Host ""
