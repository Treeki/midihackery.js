# midihackery.js

## What's This?

An open-source JavaScript library that wraps libTiMidity (transpiled to JS via
Emscripten) to provide MIDI synthesis to web pages.

You will need to provide a set of TiMidity patches (e.g. the freepats package
on many Linux distributions).

This project is inspired by [MIDIjs](http://www.midijs.net), but was written
from scratch to eliminate concerns about licensing (MIDIjs does not provide
licence information or source code for their build of libtimidity).

Tested successfully on:

- Chrome 58 on macOS 10.12.4
- Firefox 53 on macOS 10.12.4
- Safari 10.1 on macOS 10.12.4
- Edge 38 on Windows 10

## Building libtimidity

- Install emscripten (this process has been tested with Emscripten 1.37.10
  from Homebrew on macOS Sierra)
- Download the libtimidity source tarball from
  [Sourceforge](http://libtimidity.sourceforge.net) (tested with libtimidity
  0.2.4; newer versions should also work if the API remains compatible)
- Unpack the tarball into the midihackery.js root and rename its root
  directory to libtimidity (removing the version suffix)
- Apply the patch in `libtimidity-0.2.4-patch.diff`
- Run `./build_libtimidity.sh`
- With any luck, `libtimidity.js` should be produced!

## Usage

A simple example is provided in `testbed.html`.

For more detailed API documentation, see `API.md`.

## License

libTiMidity is licensed under the Lesser General Public License 2.1.

midihackery.js is licensed under the MIT License.
