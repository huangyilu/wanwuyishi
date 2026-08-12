#!/usr/bin/env bash
# 下载「南法新增城市/景点」的 Wikimedia 自由版权图到 public/img
#
# 背景：玩无一失世界库图片统一来自 Wikimedia Commons（CC BY / CC BY-SA / CC0）。
#       cityImages.ts / poiImages.ts / credits.json 里的映射已就绪，
#       本脚本只需把图文件落到仓库，前端即可显示，无需再改代码。
# 注意：必须在「能联网」的环境运行（本机或 CI 均可）。在受限代理环境
#       Wikimedia 可能不可达，会得到 FAIL（此时图缺失，新条目显示占位）。
set -u
cd "$(dirname "$0")/.."

items=(
  "city-nice|Nice_panorama.jpg"
  "city-cannes|Cannes_Panorama.jpg"
  "city-marseille|Marseille_Panorama.jpg"
  "city-avignon|Avignon_Panorama.jpg"
  "city-saint-paul|Saint-Paul-de-Vence.jpg"
  "poi-promenade-anglais|Promenade_des_Anglais_Nice.jpg"
  "poi-castle-hill-nice|Nice_Castle_Hill_view.jpg"
  "poi-palais-festivals|Palais_des_festivals_Cannes.jpg"
  "poi-le-suquet|Le_Suquet_Cannes.jpg"
  "poi-notre-dame-garde|Notre-Dame_de_la_Garde_Marseille.jpg"
  "poi-chateau-if|Ch%C3%A2teau_d%27If.jpg"
  "poi-palais-papes|Palais_des_Papes_Avignon.jpg"
  "poi-pont-avignon|Pont_Saint-B%C3%A9nez_Avignon.jpg"
  "poi-maeght|Fondation_Maeght.jpg"
)

ok=0; fail=0
for it in "${items[@]}"; do
  id="${it%%|*}"; f="${it##|*}"
  if [[ "$id" == poi-* ]]; then dir=public/img/pois; else dir=public/img/cities; fi
  url="https://commons.wikimedia.org/wiki/Special:FilePath/$f?width=1280"
  code=$(curl -sL --max-time 90 -o "$dir/$id.jpg" -w "%{http_code}" "$url")
  ct=$(file -b --mime-type "$dir/$id.jpg" 2>/dev/null)
  if [[ "$ct" == image/* ]]; then echo "OK   $id"; ok=$((ok+1)); else echo "FAIL $id (http=$code)"; rm -f "$dir/$id.jpg"; fail=$((fail+1)); fi
done

echo "---- 下载完成：成功 $ok，失败 $fail ----"
[[ $fail -eq 0 ]] || echo "有失败项：换网络或核实 Commons 文件名后重跑本脚本即可，映射无需改动。"
