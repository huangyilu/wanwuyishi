#!/usr/bin/env bash
#
# build-pmtiles.sh — 生成「法意瑞」范围的轻量矢量地图瓦片（.pmtiles）
#
# 用途：把玩无一失的行程地图从「高德位图兜底」升级成 TripProf 同款矢量质感。
#       产物 public/tiles.pmtiles 会被 MapPanel 自动探测并启用（无需改代码）。
#       瓦片随 GitHub Pages 一起部署 —— 零成本、无 key、大陆可达。
#
# ★ 本脚本【不依赖 Homebrew / Xcode Command Line Tools】：
#   - Java 21 从 Adoptium 官方直接下载 tar 包解压（无需 brew/CLT）
#   - pmtiles 用官方单文件二进制（从 GitHub Releases 直接下）
#   - Planetiler 用 --area 自动下载 Geofabrik 法/意/瑞数据，无需手动下 pbf
#
# 用法：
#   ./scripts/build-pmtiles.sh            # 正常构建
#   ./scripts/build-pmtiles.sh --force    # 忽略已缓存的 jar/二进制，重新下载
#   MAXZOOM=13 ./scripts/build-pmtiles.sh # 调高细节（文件更大，注意 GitHub 单文件 100MB 上限）
#
# 产物大小参考（z12 三国合计约 30–90MB；z13 可能破 100MB，推不上 GitHub Pages）。
#
set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$REPO_ROOT/.tilebuild"
OUT="$REPO_ROOT/public/tiles.pmtiles"

# —— 可调参数 ——
MAXZOOM="${MAXZOOM:-12}"
COUNTRIES=(france italy switzerland)
FORCE="${1:-}"

mkdir -p "$WORK_DIR"

# —— 架构判定（mac 的 Intel/Apple 芯片）——
UNAME_M="$(uname -m)"
ARCH_TAR="x64"; ARCH_BIN="amd64"
if [ "$UNAME_M" = "arm64" ]; then
  ARCH_TAR="aarch64"; ARCH_BIN="arm64"
fi

# —— 1) Java 21+（优先用系统已有的；没有或版本过低则从 Adoptium 下载 tar 包）——
JAVA="java"
if command -v java >/dev/null 2>&1; then
  JAVA_VER="$(java -version 2>&1 | head -n1 | grep -oE '[0-9]+' | head -n1)" || true
fi
if [ -z "${JAVA_VER:-}" ] || [ "${JAVA_VER:-0}" -lt 21 ]; then
  echo "· 未检测到 Java 21+，从 Adoptium 下载 Temurin 21（$ARCH_TAR）…"
  JDK_DIR="$WORK_DIR/jdk"
  if [ ! -x "$JDK_DIR/bin/java" ] || [ "$FORCE" = "--force" ]; then
    curl -fsSL --retry 5 --retry-delay 2 -o "$WORK_DIR/jdk.tar.gz" \
      "https://api.adoptium.net/v3/binary/latest/21/ga/mac/${ARCH_TAR}/jdk/hotspot/normal/eclipse"
    rm -rf "$JDK_DIR"
    mkdir -p "$JDK_DIR"
    tar xzf "$WORK_DIR/jdk.tar.gz" -C "$JDK_DIR" --strip-components=1
  fi
  JAVA="$JDK_DIR/bin/java"
fi
echo "· 将使用 Java：$JAVA"

# —— 2) pmtiles 单文件二进制（从 GitHub Releases 直接下）——
PMT="$WORK_DIR/pmtiles"
if [ ! -x "$PMT" ] || [ "$FORCE" = "--force" ]; then
  echo "· 下载 pmtiles 二进制（darwin/$ARCH_BIN）…"
  PMTAG="$(curl -fsSL --retry 5 --retry-delay 2 https://api.github.com/repos/protomaps/go-pmtiles/releases/latest \
            | grep -oE '"tag_name": *"v?[0-9.]+"' | head -n1 | grep -oE '[0-9.]+')"
  curl -fsSL --retry 5 --retry-delay 2 -o "$WORK_DIR/pmtiles.tar.gz" \
    "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTAG}/pmtiles_${PMTAG}_darwin_${ARCH_BIN}.tar.gz"
  tar xzf "$WORK_DIR/pmtiles.tar.gz" -C "$WORK_DIR"
  chmod +x "$PMT"
fi

# —— 3) Planetiler jar（取最新 release，缓存）——
JAR="$WORK_DIR/planetiler.jar"
if [ ! -f "$JAR" ] || [ "$FORCE" = "--force" ]; then
  echo "· 下载 Planetiler…"
  PTAG="$(curl -fsSL --retry 5 --retry-delay 2 https://api.github.com/repos/onthegomap/planetiler/releases/latest \
           | grep -oE '"tag_name": *"v?[0-9.]+"' | head -n1 | grep -oE '[0-9.]+')"
  curl -fsSL --retry 5 --retry-delay 2 -o "$JAR" \
    "https://github.com/onthegomap/planetiler/releases/download/v${PTAG}/planetiler-${PTAG}.jar"
fi

# —— 4) 每个国家：Planetiler 自动下 Geofabrik 数据并出 pmtiles ——
for c in "${COUNTRIES[@]}"; do
  echo "· Planetiler 构建 $c（自动下载 Geofabrik 数据，maxzoom=$MAXZOOM）…"
  "$JAVA" -Xmx8g -jar "$JAR" --download --area="$c" \
    --output="$WORK_DIR/${c}.pmtiles" --maxzoom="$MAXZOOM" --force
done

# —— 5) 合并为单个 pmtiles ——
echo "· pmtiles merge 三国 → $OUT"
rm -f "$OUT"
PARTS=()
for c in "${COUNTRIES[@]}"; do PARTS+=("$WORK_DIR/${c}.pmtiles"); done
"$PMT" merge "${PARTS[@]}" "$OUT"

# —— 6) 收尾 ——
SIZE="$(du -h "$OUT" | cut -f1)"
BYTES="$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")"
echo "✓ 完成：$OUT （$SIZE）"
if [ "$BYTES" -gt 104857600 ]; then
  echo "⚠ 文件超过 100MB，无法直接 git 推到 GitHub Pages（单文件硬上限）。"
  echo "  方案：降低 MAXZOOM（如 12），或把 tiles.pmtiles 挂到外部免费静态托管后改 MapPanel 的 pmUrl。"
fi
echo "  刷新浏览器 → 进任意行程 → 中栏切「地图」即可看到矢量底图。"
