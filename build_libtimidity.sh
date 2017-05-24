#!/bin/sh

FLAGS=-O3

# debugging stuff!
#FLAGS="-g4 -DTIMIDITY_DEBUG"

emcc -o libtimidity.js $FLAGS --memory-init-file 0 libtimidity/src/*.c -s EXPORTED_FUNCTIONS=@exports.json -s MODULARIZE=1 -s EXPORT_NAME="'LibTimidity'" -s EXTRA_EXPORTED_RUNTIME_METHODS="['FS']"
