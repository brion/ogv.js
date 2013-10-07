(function() {

	/**
	 * Quickie wrapper around XHR to fetch a file as blob chunks.
	 * Does not yet actually deliver during download, however.
	 * Safari doesn't seem to currently support a streaming/progressive
	 * XHR option that I can see. :( May have to do multiple partial reqs.
	 */
	function StreamFile(options) {
		var url = options.url,
			reader = new XMLHttpRequest(),
			onread = options.onread,
			ondone = options.ondone,
			onerror = options.onerror,
			xhr = new XMLHttpRequest(),
			bufferSize = options.bufferSize || 1024 * 1024,
			bufferDelay = 250,
			lastPosition = 0;

		function dataRemaining() {
			return xhr.response.byteLength > lastPosition;
		}

		function readChunk() {
			if (dataRemaining()) {
				var chunk = xhr.response.slice(lastPosition, lastPosition + bufferSize);
				lastPosition = lastPosition + chunk.byteLength;
				onread(chunk);
			}
		}

		function asyncProcessChunk() {
			if (dataRemaining()) {
				readChunk();
				window.setTimeout(asyncProcessChunk, bufferDelay);
			} else {
				ondone();
				xhr = null;
			}
		}
		
		xhr.open("GET", url);
		xhr.responseType = "arraybuffer";
		xhr.onreadystatechange = function(event) {
			if (xhr.readyState == 2) {
				if (xhr.status >= 400) {
					// errrorrrrrrr
					onerror("HTTP " + xhr.status + ": " +xhr.statusText);
					xhr.abort();
					xhr = null;
				}
			} else if (xhr.readyState == 3) {
				// partial data...
				// on Firefox we can use 'moz-blob' but there's no equivalent in Safari.
				// figure out later
			} else if (xhr.readyState == 4) {
				asyncProcessChunk();
			}
		};
		xhr.send();
	}


	OgvJs.init();
	OgvJs.onframe = function(event) {
		console.log("got frame event");
		console.log(event);
	};

	var player = document.getElementById('player'),
		canvas = player.querySelector('canvas'),
		ctx = canvas.getContext('2d'),
		videoChooser = document.getElementById('video-chooser');
	
	function showSelectedVideo() {
		var url = videoChooser.value;
		console.log("Going to try streaming data from " + url);

		var stream = new StreamFile({
			url: url,
			onread: function(data) {
				console.log("We have a buffer of size " + data.byteLength);
				OgvJs.receiveInput(data);
				function pingProcess() {
					console.log("ping process!");
					if (OgvJs.process()) {
						console.log("SCHEDULING MORE");
						window.setTimeout(pingProcess, 50);
					} else {
						console.log("NO MORE PACKETS");
					}
				}
				window.setTimeout(pingProcess, 50);
			},
			ondone: function() {
				console.log("reading done.");
				//OgvJs.destroy();
			},
			onerror: function(err) {
				console.log("reading encountered error: " + err);
				//OgvJs.destroy();
			}
		});
	}
	videoChooser.addEventListener('change', showSelectedVideo);
	showSelectedVideo();

})();