#!/bin/bash
set -e
CMD=${1:-help}
case "$CMD" in
  generate)
    dart run build_runner build --delete-conflicting-outputs ;;
  watch)
    dart run build_runner watch --delete-conflicting-outputs ;;
  clean-generate)
    dart run build_runner clean
    dart run build_runner build --delete-conflicting-outputs ;;
  *)
    echo "Usage: ./scripts/build.sh [generate|watch|clean-generate]" ;;
esac
