#!/bin/bash
# Stop hook: 40回目以降、10回おきに未コミット変更があればリマインド
HASH=$(echo -n "$(pwd)" | md5 2>/dev/null || echo -n "$(pwd)" | md5sum 2>/dev/null | cut -c1-8)
COUNTER_FILE="/tmp/claude-stop-counter-${HASH:0:8}"

# カウンタ読み込み・インクリメント
count=$(($(cat "$COUNTER_FILE" 2>/dev/null || echo 0) + 1))
echo "$count" > "$COUNTER_FILE"

# 40回未満は何もしない
if [ "$count" -lt 40 ]; then
  exit 0
fi

# 40回目、またはそれ以降10回おき
if [ "$count" -eq 40 ] || [ $(( (count - 40) % 10 )) -eq 0 ]; then
  # 未コミット変更があるか確認
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "{\"systemMessage\": \"[${count}回目] 未コミットの変更があります。WIP コミットしておきませんか？\"}"
  fi
fi
