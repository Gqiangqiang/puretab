#!/bin/bash
# 纯页 PureTab 扩展打包脚本
# 用法: ./pack.sh

set -e

NAME="puretab"
VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUTPUT="dist/${NAME}-v${VERSION}.zip"

echo "📦 打包 纯页 PureTab v${VERSION}..."

# 清理旧的 dist
rm -rf dist
mkdir -p dist

# 打包（排除非上架文件）
zip -r -X "$OUTPUT" \
  manifest.json \
  newtab.html \
  css/ \
  js/ \
  icons/ \
  _locales/ \
  -x "*/.*" "*/.DS_Store"

echo ""
echo "✅ 打包完成: $OUTPUT"
echo "   文件大小: $(du -h "$OUTPUT" | cut -f1)"
echo ""
echo "📋 包含文件:"
unzip -l "$OUTPUT"
