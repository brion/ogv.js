"use strict";

/**
 * Proxy object for web worker interface for codec classes.
 *
 * Used by the high-level player interface.
 *
 * @author Brion Vibber <brion@pobox.com>
 * @copyright 2015-2019 Brion Vibber
 * @license MIT-style
 */
var OGVLoader = require("./OGVLoader.js");

function OGVWrapperCodec(options) {
	options = options || {};
	var self = this,
		demuxer = null,
		videoDecoder = null,
		audioDecoder = null,
		flushIter = 0;

	// Wrapper for callbacks to drop them after a flush
	function flushSafe(func) {
		var savedFlushIter = flushIter;
		return function(arg) {
			if (flushIter <= savedFlushIter) {
				func(arg);
			}
		};
	}

	this.loadedMetadata = false;
	this.processing = false;

	Object.defineProperties(self, {
		duration: {
			get: function() {
				if (self.loadedMetadata) {
					return demuxer.duration;
				} else {
					return NaN;
				}
			}
		},
		hasAudio: {
			get: function() {
				return self.loadedMetadata && !!audioDecoder;
			}
		},
		audioReady: {
			get: function() {
				return self.hasAudio && demuxer.audioReady;
			}
		},
		audioTimestamp: {
			get: function() {
				return demuxer.audioTimestamp;
			}
		},
		audioFormat: {
			get: function() {
				if (self.hasAudio) {
					return audioDecoder.audioFormat;
				} else {
					return null;
				}
			}
		},
		audioBuffer: {
			get: function() {
				if (self.hasAudio) {
					return audioDecoder.audioBuffer;
				} else {
					return null;
				}
			}
		},
		hasVideo: {
			get: function() {
				return self.loadedMetadata && !!videoDecoder;
			}
		},
		frameReady: {
			get: function() {
				return self.hasVideo && demuxer.frameReady;
			}
		},
		frameTimestamp: {
			get: function() {
				return demuxer.frameTimestamp;
			}
		},
		keyframeTimestamp: {
			get: function() {
				return demuxer.keyframeTimestamp;
			}
		},
		nextKeyframeTimestamp: {
			get: function() {
				return demuxer.nextKeyframeTimestamp;
			}
		},
		videoFormat: {
			get: function() {
				if (self.hasVideo) {
					return videoDecoder.videoFormat;
				} else {
					return null;
				}
			}
		},
		frameBuffer: {
			get: function() {
				if (self.hasVideo) {
					return videoDecoder.frameBuffer;
				} else {
					return null;
				}
			}
		},
		seekable: {
			get: function() {
				return demuxer.seekable;
			}
		},

		demuxerCpuTime: {
			get: function() {
				if (demuxer) {
					return demuxer.cpuTime;
				} else {
					return 0;
				}
			}
		},
		audioCpuTime: {
			get: function() {
				if (audioDecoder) {
					return audioDecoder.cpuTime;
				} else {
					return 0;
				}
			}
		},
		videoCpuTime: {
			get: function() {
				if (videoDecoder) {
					return videoDecoder.cpuTime;
				} else {
					return 0;
				}
			}
		}
	});

	// - public methods
	self.init = function(callback) {
		var demuxerClassName;
		if (options.type === 'video/webm' || options.type === 'audio/webm') {
			demuxerClassName = options.wasm ? 'OGVDemuxerWebMW' : 'OGVDemuxerWebM';
		} else {
			demuxerClassName = options.wasm ? 'OGVDemuxerOggW' : 'OGVDemuxerOgg';
		}
		self.processing = true;
		OGVLoader.loadClass(demuxerClassName, function(demuxerClass) {
			demuxerClass().then(function(demuxerModule) {
				demuxer = demuxerModule;
				demuxer.onseek = function(offset) {
					if (self.onseek) {
						self.onseek(offset);
					}
				};
				demuxer.init(function() {
					self.processing = false;
					callback();
				});
			});
		});
	};

	self.close = function() {
		if (demuxer) {
			demuxer.close();
			demuxer = null;
		}
		if (videoDecoder) {
			videoDecoder.close();
			videoDecoder = null;
		}
		if (audioDecoder) {
			audioDecoder.close();
			audioDecoder = null;
		}
	};

	self.receiveInput = function(data, callback) {
		demuxer.receiveInput(data, callback);
	};

	var audioClassMap = {
		vorbis: options.wasm ? 'OGVDecoderAudioVorbisW' : 'OGVDecoderAudioVorbis',
		opus: options.wasm ? 'OGVDecoderAudioOpusW' : 'OGVDecoderAudioOpus'
	};
	function loadAudioCodec(callback) {
		if (demuxer.audioCodec) {
			var className = audioClassMap[demuxer.audioCodec];
			self.processing = true;
			OGVLoader.loadClass(className, function(audioCodecClass) {
				var audioOptions = {};
				if (demuxer.audioFormat) {
					audioOptions.audioFormat = demuxer.audioFormat;
				}
				audioCodecClass(audioOptions).then(function(decoder) {
					audioDecoder = decoder;
					audioDecoder.init(function() {
						loadedAudioMetadata = audioDecoder.loadedMetadata;
						self.processing = false;
						callback();
					});
				});
			}, {
				worker: options.worker
			});
		} else {
			callback();
		}
	}

	var videoClassMap = {
		theora: options.wasm ? 'OGVDecoderVideoTheoraW' : 'OGVDecoderVideoTheora',
		vp8: options.wasm ? 'OGVDecoderVideoVP8W' : (options.threading ? 'OGVDecoderVideoVP8MT' : 'OGVDecoderVideoVP8'),
		vp9: options.wasm ? 'OGVDecoderVideoVP9W' : (options.threading ? 'OGVDecoderVideoVP9MT' : 'OGVDecoderVideoVP9'),
		av1: options.wasm ? 'OGVDecoderVideoAV1W' : 'OGVDecoderVideoAV1'
	};
	function loadVideoCodec(callback) {
		if (demuxer.videoCodec) {
			var className = videoClassMap[demuxer.videoCodec];
			self.processing = true;
			OGVLoader.loadClass(className, function(videoCodecClass) {
				var videoOptions = {};
				if (demuxer.videoFormat) {
					videoOptions.videoFormat = demuxer.videoFormat;
				}
				if (options.memoryLimit) {
					videoOptions.memoryLimit = options.memoryLimit;
				}
				videoCodecClass(videoOptions).then(function(decoder) {
					videoDecoder = decoder;
					videoDecoder.init(function() {
						loadedVideoMetadata = videoDecoder.loadedMetadata;
						self.processing = false;
						callback();
					});
				});
			}, {
				worker: options.worker && !options.threading
			});
		} else {
			callback();
		}
	}

	var loadedDemuxerMetadata = false,
		loadedAudioMetadata = false,
		loadedVideoMetadata = false,
		loadedAllMetadata = false;

	self.process = function(callback) {
		if (self.processing) {
			throw new Error('reentrancy fail on OGVWrapperCodec.process');
		}
		self.processing = true;

		var videoPacketCount = demuxer.videoPackets.length,
			audioPacketCount = demuxer.audioPackets.length;
		function finish(result) {
			self.processing = false;
			callback(result);
		}

		function doProcessData() {
			demuxer.process(finish);
		}

		if (demuxer.loadedMetadata && !loadedDemuxerMetadata) {

			// Demuxer just reached its metadata. Load the relevant codecs!
			loadAudioCodec(function() {
				loadVideoCodec(function() {
					loadedDemuxerMetadata = true;
					loadedAudioMetadata = !audioDecoder;
					loadedVideoMetadata = !videoDecoder;
					loadedAllMetadata = loadedAudioMetadata && loadedVideoMetadata;
					finish(true);
				});
			});

		} else if (loadedDemuxerMetadata && !loadedAudioMetadata) {

			if (audioDecoder.loadedMetadata) {

				loadedAudioMetadata = true;
				loadedAllMetadata = loadedAudioMetadata && loadedVideoMetadata;
				finish(true);

			} else if (demuxer.audioReady) {

				demuxer.dequeueAudioPacket(function(packet) {
					self.audioBytes += packet.byteLength;
					audioDecoder.processHeader(packet, function(ret) {
						finish(true);
					});
				});

			} else {

				doProcessData();

			}

		} else if (loadedAudioMetadata && !loadedVideoMetadata) {

			if (videoDecoder.loadedMetadata) {

				loadedVideoMetadata = true;
				loadedAllMetadata = loadedAudioMetadata && loadedVideoMetadata;
				finish(true);

			} else if (demuxer.frameReady) {

				self.processing = true;
				demuxer.dequeueVideoPacket(function(packet) {
					self.videoBytes += packet.byteLength;
					videoDecoder.processHeader(packet, function() {
						finish(true);
					});
				});

			} else {

				doProcessData();

			}

		} else if (loadedVideoMetadata && !self.loadedMetadata && loadedAllMetadata) {

			// Ok we've found all the metadata there is. Enjoy.
			self.loadedMetadata = true;
			finish(true);

		} else if (self.loadedMetadata && (!self.hasAudio || demuxer.audioReady) && (!self.hasVideo || demuxer.frameReady)) {

			// Already queued up some packets. Go read them!
			finish(true);

		} else {

			// We need to process more of the data we've already received,
			// or ask for more if we ran out!
			doProcessData();

		}

	};

	self.decodeFrame = function(callback) {
		var cb = flushSafe(callback),
			timestamp = self.frameTimestamp,
			keyframeTimestamp = self.keyframeTimestamp;
		demuxer.dequeueVideoPacket(function(packet) {
			self.videoBytes += packet.byteLength;
			videoDecoder.processFrame(packet, function(ok) {
				// hack
				if (videoDecoder.frameBuffer) {
					videoDecoder.frameBuffer.timestamp = timestamp;
					videoDecoder.frameBuffer.keyframeTimestamp = keyframeTimestamp;
				}
				cb(ok);
			});
		});
	};

	self.decodeAudio = function(callback) {
		var cb = flushSafe(callback);
		demuxer.dequeueAudioPacket(function(packet) {
			self.audioBytes += packet.byteLength;
			audioDecoder.processAudio(packet, cb);
		});
	}

	self.discardFrame = function(callback) {
		demuxer.dequeueVideoPacket(function(packet) {
			self.videoBytes += packet.byteLength;
			callback();
		});
	};

	self.discardAudio = function(callback) {
		demuxer.dequeueAudioPacket(function(packet) {
			self.audioBytes += packet.byteLength;
			callback();
		});
	};

	self.flush = function(callback) {
		flushIter++;
		demuxer.flush(callback);
	};

	self.getKeypointOffset = function(timeSeconds, callback) {
		demuxer.getKeypointOffset(timeSeconds, callback);
	};

	self.seekToKeypoint = function(timeSeconds, callback) {
		demuxer.seekToKeypoint(timeSeconds, flushSafe(callback));
	}

	self.onseek = null;

	self.videoBytes = 0;
	self.audioBytes = 0;

	return self;
}

module.exports = OGVWrapperCodec;
