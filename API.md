# Loading the library

To load the library, call `MIDIHackery.loadLibrary('path/to/libtimidity.js');`.
(The path is optional; if omitted, it will simply load `libtimidity.js` from
the directory that the web page is in.)

To add a callback that will be executed when the library is done initialising,
call `MIDIHackery.onLoad(function() { ... });`.

Alternatively, if you don't mind the weight of ~210kb of JavaScript on your
page, you can skip these steps and just reference `libtimidity.js` directly
using a `<script>` tag.

## The `MIDIHackery.Player` object

`MIDIHackery.Player` wraps an instance of the libTiMidity player and its patch
set. You'll probably only want to have one of these.

    var player = new MIDIHackery.Player(dataPath, cfgData);

`dataPath` should be the path that contains your `timidity.cfg` file and its
patches (e.g. for freepats, you'll have `Drum_000` and `Tone_000` directories
in there).

`cfgData` is optional. If you provide it, it should be a string containing the
contents of the `timidity.cfg` file. If you don't provide it, it will
automatically be downloaded from the directory referenced by `dataPath`.

To receive a callback when the player is ready to load songs, call
`player.on('ready', function() { ... });`.

To receive a callback if an error occurs, call
`player.on('error', function(data) { ... });`. The data object will contain
fields explaining what kind of error occurred.

To load a song, call `player.loadSongFromBuffer(midiBuffer, params)` (passing
in an ArrayBuffer containing a MIDI file) or
`player.loadSongFromURL(url, params)` (passing in an absolute or relative URL
to a MIDI file). A `MIDIHackery.Song` object will be returned.

`params` is an object containing parameters for the renderer:

- **format**: one of 'u8', 'u16', 's8', 's16'; format of the rendered audio.
  Defaults to 's16'.
- **sampleRate**: sample rate of the rendered audio in hz. Minimum 4000,
  maximum 256000. Defaults to 44100.
- **channels**: amount of channels to render the MIDI with. 1 = mono, 2 =
  stereo. Defaults to 2.
- **bufferSize**: amount of samples to render with each call into libtimidity.
  Defaults to 8192.

## The `MIDIHackery.Song` object

`MIDIHackery.Song` wraps a single playing song, and is tied to a `Player`
instance. It is created by calling the `loadSongFromBuffer` or
`loadSongFromURL` method on a `Player` object.

To receive a callback when the song has loaded and is ready for playback, call
`song.on('ready', function() { ... });`.

To receive a callback if an error occurs, call
`song.on('error', function(data) { ... });`.

Once the song has loaded successfully, call `song.start();` to begin playback.

To clean up the resources used by the song (important to avoid leaking memory
inside the libtimidity player), call `song.cleanup();`.

To get the current position in the song (in seconds), call `song.getTime()`.

To get the duration of the song (in seconds), call `song.getTotalTime()`.

### Rendering to a WebAudio node

Call `song.createAudioNode(audioContext, autoCleanup)`, where `audioContext`
is an `AudioContext` object. This will return a node which can be connected to
another WebAudio node.

For simple usage you would probably just call
`node.connect(audioContext.destination);` on the returned node, but you might
want to do something fancier if you want to mess with the volume or apply
effects to it or something like that.

`autoCleanup` is optional, and set to true by default. If true, the node will
be disconnected from the WebAudio graph and `song.cleanup();` will be called
automatically as soon as playback reaches the end of the MIDI.

In either case, an event will be raised which you can handle by calling:
`song.on('ended', function() { ... });`

### Rendering to a sample buffer

Call `song.render(outputArray)`. outputArray should be a typed array view with
a format matching that provided when creating the Song (`Uint8Array` for 'u8',
`Int16Array` for 's16', and so forth). The amount of elements in the array
should be equal to `bufferSize * channels`.

The amount of samples rendered will be returned. Typically this will be equal
to `bufferSize` -- the only situation where it will differ is when the end of
the song is reached. Once playback has finished, `song.render(...)` will
return 0.

If rendering in stereo mode (`channels == 2`), the data for the two channels
is interleaved in the output array; so the first sample's values are in
`outputArray[0]` and `outputArray[1]` (left and right channels respectively),
the second sample's values are in `outputArray[2]` and `outputArray[3]`, and
so forth.

This method will NOT raise the 'ended' event; you are expected to detect when
0 is returned and then call `song.cleanup();` and perform other
appropriate on-end logic.
