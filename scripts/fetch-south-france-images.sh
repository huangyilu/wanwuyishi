#!/usr/bin/env bash
# 下载「南法新增城市/景点」的 Wikimedia 自由版权图到 public/img
#
# 背景：玩无一失世界库图片统一来自 Wikimedia Commons（CC BY / CC BY-SA / CC0）。
#       cityImages.ts / poiImages.ts / credits.json 里的映射已就绪，
#       本脚本只需把图文件落到仓库，前端即可显示，无需再改代码。
# 注意：
#   - 文件名已逐一核对存在于 Commons（早期版本有多处拼错导致 404）。
#   - 本机若开了 WorkBuddy，它会往环境注入 HTTP_PROXY=127.0.0.1:53372，
#     该代理白名单不含 Wikimedia（curl 会 http=000 超时）。本脚本改读 macOS
#     系统代理（用户自己的，放行 Wikimedia）来覆盖它；CI/Linux 无 networksetup
#     时回落到环境变量（通常为空，直连即可）。
set -u
cd "$(dirname "$0")/.."

# 读取 macOS 系统级安全 Web 代理（用户自己的，放行 Wikimedia），覆盖注入的拦截代理
detect_proxy() {
  for svc in "Wi-Fi" "Thunderbolt Ethernet" "Ethernet"; do
    en=$(networksetup -getsecurewebproxy "$svc" 2>/dev/null | awk -F': ' '/^Enabled/{print $2}')
    [ "$en" = "Yes" ] || continue
    host=$(networksetup -getsecurewebproxy "$svc" 2>/dev/null | awk -F': ' '/^Server/{print $2}')
    port=$(networksetup -getsecurewebproxy "$svc" 2>/dev/null | awk -F': ' '/^Port/{print $2}')
    [ -n "$host" ] && { echo "http://$host:$port"; return; }
  done
  echo ""
}
P=$(detect_proxy)
if [ -n "$P" ]; then
  export HTTP_PROXY="$P" HTTPS_PROXY="$P" http_proxy="$P" https_proxy="$P"
fi

# 对 Commons 文件名做 URL 编码（含空格/括号/重音），否则 Special:FilePath 404
enc() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1"; }

items=(
  "city-nice|Nice (FR-06000) Promenade des anglais.jpg"
  "city-cannes|Waterfront residential buildings on Boulevard de la Croisette, Cannes, France (53968531025).jpg"
  "city-marseille|Marseille panorama from Palais du Pharo.jpg"
  "city-avignon|Avignon_Panorama.jpg"
  "city-saint-paul|Saint-Paul-de-Vence.jpg"
  "poi-promenade-anglais|Promenade des Anglais (Nice), France.jpg"
  "poi-castle-hill-nice|Nice France as seen From Colline du Château.jpg"
  "poi-palais-festivals|Cannes Palais des Festivals et des Congrès.jpg"
  "poi-le-suquet|Cannes from Suquet Tower 02.jpg"
  "poi-notre-dame-garde|Notre-Dame de la Garde Marseille 2024.jpg"
  "poi-chateau-if|Château d'If.jpg"
  "poi-palais-papes|Palais_des_Papes_Avignon.jpg"
  "poi-pont-avignon|Pont-Saint-Bénézet-Avignon-2012.jpg"
  "poi-maeght|Foundation Maeght museum near Saint-Paul-de-Vence - panoramio (2).jpg"
)

ok=0; fail=0
for it in "${items[@]}"; do
  id="${it%%|*}"; f="${it##|*}"
  if [[ "$id" == poi-* ]]; then dir=public/img/pois; else dir=public/img/cities; fi
  url="https://commons.wikimedia.org/wiki/Special:FilePath/$(enc "$f")?width=1280"
  code=$(curl -sL --max-time 90 --retry 3 --retry-delay 2 -o "$dir/$id.jpg" -w "%{http_code}" "$url")
  ct=$(file -b --mime-type "$dir/$id.jpg" 2>/dev/null)
  if [[ "$ct" == image/* ]]; then echo "OK   $id"; ok=$((ok+1)); else echo "FAIL $id (http=$code)"; rm -f "$dir/$id.jpg"; fail=$((fail+1)); fi
done

echo "---- 下载完成：成功 $ok，失败 $fail ----"
[[ $fail -eq 0 ]] || echo "有失败项：换网络或核实 Commons 文件名后重跑本脚本即可，映射无需改动。"
