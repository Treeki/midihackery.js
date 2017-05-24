var MIDIHackery = {
	// Callback functions to trigger as soon as LibTimidity finishes loading
	_onLoad: [],

	init: function(libPath) {
		if (MIDIHackery._initFlag)
			return; // we are already initialising (or initialised)
		MIDIHackery._initFlag = true;

		if (libPath === undefined)
			libPath = 'libtimidity.js';

		// Load the Timidity library
		var script = document.createElement('script');
		script.src = libPath;
		script.onload = function() {
			for (var i = 0; i < MIDIHackery._onLoad.length; i++)
				MIDIHackery._onLoad[i]();
			delete MIDIHackery._onLoad;
		};
		document.body.appendChild(script);
	},

	onLoad: function(callback) {
		MIDIHackery._onLoad.push(callback);
	}
};


/** @constructor */
MIDIHackery.Player = function(dataPath, cfgData) {
	if (!(/^\/$/.test(dataPath)))
		dataPath = dataPath + '/';
	this._dataPath = dataPath;
	this._module = LibTimidity();
	this._initFlag = false;

	if (cfgData !== undefined)
		this._begin(cfgData);
	else
		this._downloadConfiguration();

	this._patchRequests = {};
	this._eventHandlers = {
		'ready': [],
		'error': []
	};
};

MIDIHackery.Player.prototype = {
	// Request a function to be called when an event occurs
	// 'ready': Player is ready to play songs
	// 'error': An initialisation error has occurred
	on: function(name, callback) {
		this._eventHandlers[name].push(callback);
	},
	_emitEvent: function(name, data) {
		var callbacks = this._eventHandlers[name];
		for (var i = 0; i < callbacks.length; i++)
			callbacks[i](data);
	},

	_downloadConfiguration: function() {
		var self = this;
		var xhr = new XMLHttpRequest;
		xhr.open('GET', this._dataPath + 'timidity.cfg');
		xhr.onreadystatechange = function() {
			if (xhr.readyState === XMLHttpRequest.DONE) {
				if (xhr.status === 200) {
					// Done!
					self._begin(xhr.response);
				} else {
					// TODO: Logic to retry?
					self._emitEvent('error', {action: 'configDownload', code: xhr.status});
				}
			}
		};
		xhr.send();
	},

	_begin: function(cfgData) {
		this._module.FS.writeFile('/timidity.cfg', cfgData);
		var result = this._module._mid_init(0);
		if (result === 0) {
			this._initFlag = true;
			this._emitEvent('ready');
		}
		else
			this._emitEvent('error', {action: 'init', code: result});
	},

	// Load the MIDI file contained within the given ArrayBuffer.
	loadSongFromBuffer: function(midiBuffer, params) {
		if (!this._initFlag)
			return null;

		var song = new MIDIHackery.Song(this, params);
		song.loadFromBuffer(midiBuffer);
		return song;
	},

	// Load a MIDI file, downloaded from the given URL.
	loadSongFromURL: function(url, params) {
		if (!this._initFlag)
			return null;

		var song = new MIDIHackery.Song(this, params);
		song.loadFromURL(url);
		return song;
	},

	_requestPatch: function(name, readyCallback) {
		if (this._patchRequests[name]) {
			// We've got a pending request for this patch, so no need
			// to start off another one
			this._patchRequests[name].readyCallbacks.push(readyCallback);
			return;
		}

		var self = this;
		var xhr = new XMLHttpRequest;
		xhr.open('GET', this._dataPath + name);
		xhr.responseType = 'arraybuffer';
		xhr.readyCallbacks = [readyCallback];
		xhr.onreadystatechange = function() {
			if (xhr.readyState === XMLHttpRequest.DONE) {
				if (xhr.status === 200) {
					// Done!
					self._injectPatch(name, xhr.response);
					for (var i = 0; i < xhr.readyCallbacks.length; i++)
						xhr.readyCallbacks[i](name);
				} else {
					// TODO: Logic to retry?
					self._emitEvent('error', {action: 'patchDownload', code: xhr.status, name: name});
				}
				delete self._patchRequests[name];
			}
		};
		this._patchRequests[name] = xhr;
		xhr.send();
	},

	_injectPatch: function(name, data) {
		var fs = this._module.FS;
		var pathBits = name.split('/');
		var basename = pathBits.pop();

		// Create the intermediate directories, if necessary
		var work = '/';
		for (var i = 0; i < pathBits.length; i++) {
			try {
				fs.mkdir(work + pathBits[i]);
			} catch (e) {
				// do nothing
			}
			work = work + pathBits[i] + '/';
		}

		this._module.FS.writeFile(work + basename, new Uint8Array(data), {'encoding': 'binary'});
	}
};


/** @constructor */
MIDIHackery.Song = function(player, params) {
	this._player = player;
	this._eventHandlers = {
		'ready': [],
		'error': [],
		'ended': []
	};

	if (params === undefined)
		params = {};
	this._format = params.format || 's16';
	this._rate = params.sampleRate || 44100;
	this._channels = params.channels || 2;
	this._bufferPtr = 0;
	this._bufferSize = params.bufferSize || 8192;
	this._songPtr = 0;
	this._missingFiles = [];
};

MIDIHackery.Song.prototype = {
	// Request a function to be called when an event occurs
	// 'ready': Song and the necessary patch files have been loaded
	// 'error': An error has occurred
	on: function(name, callback) {
		this._eventHandlers[name].push(callback);
	},
	_emitEvent: function(name, data) {
		var callbacks = this._eventHandlers[name];
		for (var i = 0; i < callbacks.length; i++)
			callbacks[i](data);
	},

	loadFromURL: function(url) {
		var self = this;
		var xhr = new XMLHttpRequest;
		xhr.open('GET', url);
		xhr.responseType = 'arraybuffer';
		xhr.onreadystatechange = function() {
			if (xhr.readyState === XMLHttpRequest.DONE) {
				if (xhr.status === 200) {
					// Done!
					self.loadFromBuffer(xhr.response);
				} else {
					// TODO: Logic to retry?
					self._emitEvent('error', {action: 'midiDownload', code: xhr.status});
				}
			}
		};
		xhr.send();
	},

	loadFromBuffer: function(buffer) {
		this._midiBuffer = buffer;
		this._tryToLoadSong();
	},

	_tryToLoadSong: function() {
		if (this._songPtr)
			return;

		var m = this._player._module;

		var formatCode = 8; // U8
		switch (this._format) {
			case 'u8': formatCode = 8; break;
			case 's8': formatCode = 0x8008; break;
			case 'u16': case 'u16lsb': formatCode = 0x10; break;
			case 's16': case 's16lsb': formatCode = 0x8010; break;
			case 'u16msb': formatCode = 0x1010; break;
			case 's16msb': formatCode = 0x9010; break;
		}
		var optionsPtr = m._mid_alloc_options(this._rate, formatCode, this._channels, this._bufferSize);

		// Create a stream
		var midiBufferPtr = m._malloc(this._midiBuffer.byteLength);
		m.HEAPU8.set(new Uint8Array(this._midiBuffer), midiBufferPtr);

		var iStreamPtr = m._mid_istream_open_mem(midiBufferPtr, this._midiBuffer.byteLength);

		// Now, we can try to load the song itself
		var songPtr = m._mid_song_load(iStreamPtr, optionsPtr);

		if (songPtr === 0) {
			// Something failed.
			// TODO: Get some kinda error info from the library?
			m._mid_istream_close(iStreamPtr);
			m._free(optionsPtr);
			m._free(midiBufferPtr);
			self._emitEvent('error', {action: 'midiLoad'});
			return;
		}

		// We've got a song!
		// Clean up stuff we don't need any more
		m._mid_istream_close(iStreamPtr);
		m._free(optionsPtr);
		m._free(midiBufferPtr);

		// Is it missing any patch files?
		var reqCount = m._mid_get_load_request_count(songPtr);
		if (reqCount > 0) {
			// Yep, so we've got to take care of those...
			for (var i = 0; i < reqCount; i++) {
				var name = m.Pointer_stringify(m._mid_get_load_request(songPtr, i));
				this._missingFiles.push(name);
				this._player._requestPatch(name, this._patchDownloaded.bind(this));
			}

			m._mid_song_free(songPtr);
			return;
		}

		// If we got here, all the patch files are OK!
		this._songPtr = songPtr;
		this._bytesPerSample = this._channels * (((formatCode & 0xFF) == 16) ? 2 : 1);
		this._bufferPtr = m._malloc(this._bufferSize * this._bytesPerSample);
		this._emitEvent('ready');
	},

	_patchDownloaded: function(name) {
		this._missingFiles.splice(this._missingFiles.indexOf(name), 1);
		if (this._missingFiles.length == 0)
			this._tryToLoadSong();
	},

	// Get the player's position within this song, in seconds
	getTime: function() {
		return this._player._module._mid_song_get_time(this._songPtr) / 1000;
	},

	// Get the duration of this song, in seconds
	getTotalTime: function() {
		return this._player._module._mid_song_get_total_time(this._songPtr) / 1000;
	},

	// Start playback
	start: function() {
		this._player._module._mid_song_start(this._songPtr);
	},

	// Render some of the MIDI
	// Expects an array view with a data type matching the format
	// (e.g. Int16Array for s16, or Uint8Array for u8)
	render: function(outputArray) {
		var m = this._player._module;
		var byteCount = m._mid_song_read_wave(this._songPtr, this._bufferPtr, this._bufferSize * this._bytesPerSample);
		var sampleCount = byteCount / this._bytesPerSample;

		// Was anything output?
		if (sampleCount === 0) {
			this._emitEvent('ended');
			this.cleanup();
			return sampleCount;
		}

		switch (this._format) {
			case 'u8':
				outputArray.set(m.HEAPU8.subarray(this._bufferPtr, this._bufferPtr + byteCount));
				break;
			case 's8':
				outputArray.set(m.HEAP8.subarray(this._bufferPtr, this._bufferPtr + byteCount));
				break;
			case 'u16': case 'u16msb': case 'u16lsb':
				outputArray.set(m.HEAPU16.subarray(this._bufferPtr / 2, (this._bufferPtr + byteCount) / 2));
				break;
			case 's16': case 's16msb': case 's16lsb':
				outputArray.set(m.HEAP16.subarray(this._bufferPtr / 2, (this._bufferPtr + byteCount) / 2));
				break;
		}

		return sampleCount;
	},

	cleanup: function() {
		var m = this._player._module;

		if (this._bufferPtr) {
			m._free(this._bufferPtr);
			this._bufferPtr = 0;
		}
		if (this._songPtr) {
			m._mid_song_free(this._songPtr);
			this._songPtr = 0;
		}
	},

	// Create a WebAudio node.
	// Note: This function expects the format to be set to 's16',
	// and the sample rate used when creating the song to be set to the
	// AudioContext's sample rate!
	createAudioNode: function(audioContext) {
		if (this._format !== 's16')
			return null;
		if (this._rate !== audioContext.sampleRate)
			return null;

		var node = audioContext.createScriptProcessor(this._bufferSize, 0, this._channels);
		var array = new Int16Array(this._bufferSize * this._channels);
		var self = this;
		node.onaudioprocess = function(event) {
			var sampleCount = self.render(array);
			var maxSamples = self._bufferSize;

			if (self._channels == 1) {
				var output = event.outputBuffer.getChannelData(0);
				for (var i = 0; i < sampleCount; i++)
					output[i] = array[i] / 0x7FFF;
				for (var i = sampleCount; i < maxSamples; i++)
					output[i] = 0;

			} else if (self._channels == 2) {
				var output0 = event.outputBuffer.getChannelData(0),
				    output1 = event.outputBuffer.getChannelData(1);

				for (var i = 0; i < sampleCount; i++) {
					output0[i] = array[i*2] / 0x7FFF;
					output1[i] = array[i*2+1] / 0x7FFF;
				}
				for (var i = sampleCount; i < maxSamples; i++) {
					output0[i] = 0;
					output1[i] = 0;
				}
			}
		};
		this.on('ended', function() {
			node.disconnect();
		});
		return node;
	}
};
