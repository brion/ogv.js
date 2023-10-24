#!/bin/bash
set -e

. ./buildscripts/compile-options.sh

# compile wrapper around libvpx
emcc \
  $EMCC_COMMON_OPTIONS \
  $EMCC_WASM_OPTIONS \
  $EMCC_NOTHREAD_OPTIONS \
  -msimd128 \
  -s EXPORT_NAME="'OGVDecoderVideoVP8SIMD'" \
  -s EXPORTED_FUNCTIONS="`< src/js/modules/ogv-decoder-video-exports.json`" \
  -Ibuild/wasm-simd/root/include \
  --js-library src/js/modules/ogv-decoder-video-callbacks.js \
  --pre-js src/js/modules/ogv-module-pre.js \
  --post-js src/js/modules/ogv-decoder-video.js \
  -D OGV_VP8 \
  src/c/ogv-decoder-video-vpx.c \
  -Lbuild/wasm-simd/root/lib \
  -lvpx \
  -o build/ogv-decoder-video-vp8-simd.js
