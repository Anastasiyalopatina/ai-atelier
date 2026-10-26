#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Установите Node.js 24 или новее и повторите запуск.'
  read -r -p 'Нажмите Enter для выхода…' _atelier_ack
  exit 1
fi
if [ ! -d node_modules ]; then
  echo 'Первый запуск: установка зафиксированных npm-зависимостей.'
  npm ci --ignore-scripts --no-audit --no-fund
fi
npm start
