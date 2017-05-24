#!/bin/sh

emcc -o libtimidity.js -O3 --memory-init-file 0 libtimidity/src/*.c -s EXPORTED_FUNCTIONS=@exports.json -s MODULARIZE=1 -s EXPORT_NAME="'LibTimidity'" -s EXTRA_EXPORTED_RUNTIME_METHODS="['FS']"
