'use strict';

var DataInterface = require('./DataInterface.js');
var SeekHead = require('./SeekHead.js');
var SegmentInfo = require('./SegmentInfo.js');
var Tracks = require('./Tracks.js');
var Cluster = require('./Cluster.js');
var Cues = require('./Cues.js');


//States
var INITIAL_STATE = 0;
var HEADER_LOADED = 1;
var SEGMENT_LOADED = 2;
var META_LOADED = 3;
var EXIT_OK = 666;


var STATE_BEGIN = 0;
var STATE_DECODING = 1;
var STATE_SEEKING = 2;

var getTimestamp;
if (typeof performance === 'undefined' || typeof performance.now === 'undefined') {
    getTimestamp = Date.now;
} else {
    getTimestamp = performance.now.bind(performance);
}

/**
 * @classdesc Wrapper class to handle webm demuxing
 */
class OGVDemuxerWebM {

    constructor() {
        this.shown = false; // for testin
        this.clusters = [];
        this.segmentInfo = [];
        this.state = INITIAL_STATE;
        this.videoPackets = [];
        this.audioPackets = [];
        this.loadedMetadata = false;
        this.seekable = true;
        this.dataInterface = new DataInterface();
        this.segment = null;
        this.currentElement = null; // placeholder for last element
        this.segmentIsLoaded = false; // have we found the segment position
        this.segmentDataOffset;
        this.headerIsLoaded = false;
        this.currentElement = null;
        this.segmentInfo = null; // assuming 1 for now
        this.tracks = null;
        this.currentCluster = null;
        this.cpuTime = 0;
        this.seekHead = null;
        this.cuesLoaded = false;
        this.isSeeking = false;
        this.tempSeekPosition = -1;

        Object.defineProperty(this, 'duration', {
            get: function () {
                if(this.segmentInfo.duration < 0)
                    return -1;
                return this.segmentInfo.duration / 1000;// / 1000000000.0; ;
            }
        });

        Object.defineProperty(this, 'frameReady', {
            get: function () {
                return this.videoPackets.length > 0;
            }
        });

        Object.defineProperty(this, 'hasAudio', {
            get: function () {
                if (this.loadedMetadata && this.audioCodec) {
                    return true;
                } else {
                    return false;
                }
            }
        });


        Object.defineProperty(this, 'audioFormat', {
            get: function () {                  
                var channels;
                var rate;
                for (var i in this.tracks.trackEntries) {
                    var trackEntry = this.tracks.trackEntries[i];
                    if (trackEntry.trackType === 2) { // audio track
                        channels = trackEntry.channels;
                        rate = trackEntry.rate;
                        break;
                    }
                }
                //console.error("channels : " + channels + "rate : " + rate);
                var test;
                return test;
                return {
                    channels: channels,
                    rate: rate
                };
            }
        });
        
        Object.defineProperty(this, 'videoFormat', {
            get: function () {
                var tempTrack;
                for (var i in this.tracks.trackEntries) {
                    var trackEntry = this.tracks.trackEntries[i];
                    if (trackEntry.trackType === 1) { // video track
                        tempTrack = trackEntry;
                        break;
                    }
                }

                return {
                    frameWidth: tempTrack.width,
                    frameHeight: tempTrack.height,
                    hdec: 1,
                    vdec: 1,
                    fps: 0,
                    picWidth: tempTrack.width - tempTrack.pixelCropLeft - tempTrack.pixelCropRight,
                    picHeight: tempTrack.height - tempTrack.pixelCropTop - tempTrack.pixelCropBottom,
                    picX: tempTrack.pixelCropLeft,
                    picY: tempTrack.pixelCropTop,
                    displayWidth: tempTrack.displayWidth,
                    displayHeight: tempTrack.displayHeight
                };
            }
        });

        Object.defineProperty(this, 'audioReady', {
            get: function () {
                return this.audioPackets.length > 0;
            }
        });

        Object.defineProperty(this, 'audioTimestamp', {
            get: function () {
                if (this.audioPackets.length > 0) {
                    return this.audioPackets[0].timestamp;
                } else {
                    return -1;
                }
            }
        });

        Object.defineProperty(this, 'frameTimestamp', {
            get: function () {
                if (this.videoPackets.length > 0) {
                    return this.videoPackets[0].timestamp;
                } else {
                    return -1;
                }
            }
        });

        Object.defineProperty(this, 'keyframeTimestamp', {
            get: function () {
                if (this.videoPackets.length > 0) {
                    return this.videoPackets[0].keyframeTimestamp;
                } else {
                    return -1;
                }
            }
        });

        Object.defineProperty(this, 'hasVideo', {
            get: function () {
                if (this.loadedMetadata && this.videoCodec) {
                    return true;
                } else {
                    return false;
                }
            }
        });

        //Only need this property cause nest egg has it

        Object.defineProperty(this, 'videoCodec', {
            get: function () {
                var codecID;
                //Multiple video tracks are allowed, for now just return the first one
                for (var i in this.tracks.trackEntries) {
                    var trackEntry = this.tracks.trackEntries[i];
                    if (trackEntry.trackType === 1) { // video track
                        codecID = trackEntry.codecID;
                        break;
                    }


                }
                var codecName;
                switch (codecID) {
                    case "V_VP8" :
                        codecName = "vp8";
                        break;
                    default:
                        codecName = null;
                        break;
                }
                ;

                return codecName;

            }
        });


        Object.defineProperty(this, 'audioCodec', {
            get: function () {
                var codecID;
                //Multiple video tracks are allowed, for now just return the first one
                for (var i in this.tracks.trackEntries) {
                    var trackEntry = this.tracks.trackEntries[i];
                    if (trackEntry.trackType === 2) {
                        codecID = trackEntry.codecID;
                        break;
                    }


                }
                var codecName;
                switch (codecID) {
                    case "A_VORBIS" :
                        codecName = "vorbis";
                        break;
                    default:
                        codecName = null;
                        break;
                }
                ;

                return codecName;

            }
        });
    }

    /**
     * Times a function call
     */
    time(func) {
        var start = getTimestamp(),
                ret;
        ret = func();
        var delta = (getTimestamp() - start);
        this.cpuTime += delta;
        //console.log('demux time ' + delta);
        return ret;
    }

    /**
     * 
     * @param {function} callback
     */
    init(callback) {

        callback();
    }

    receiveInput(data, callback) {
        var ret = this.time(function () {
            console.log("got input");
            this.dataInterface.recieveInput(data);
        }.bind(this));
        callback();

    }

    process(callback) {
        
        var start = getTimestamp();
        var status = false;
  
        
        //this.processing = true;

        switch (this.state) {
            case INITIAL_STATE:
                this.loadHeader();
                if (this.state !== HEADER_LOADED)
                    break;
            case HEADER_LOADED:
                this.loadSegment();
                if (this.state !== SEGMENT_LOADED)
                    break;
            case SEGMENT_LOADED:
                status = this.loadMeta();
                if (this.state !== META_LOADED)
                    break;
            default:
            //fill this out
        }

        //this.processing = false;
        var delta = (getTimestamp() - start);
        this.cpuTime += delta;
        var result;
        //return status;
        if (status === 1 || status === true) {
            result = 1;
        } else {
            result = 0;
        }
        
        console.info("processing return : " + result);
        callback(!!result);
    }

    /**
     * General process loop, 
     * TODO, refactor this!!!!!
     */
    loadMeta() {
        var status = false;

        while (this.dataInterface.offset < this.segment.end) {
            if (!this.currentElement) {
                this.currentElement = this.dataInterface.peekElement();
                if (this.currentElement === null)
                    return null;
            }


            switch (this.currentElement.id) {

                case 0x114D9B74: //Seek Head
                    if (!this.seekHead)
                        this.seekHead = new SeekHead(this.currentElement, this.dataInterface);
                    this.seekHead.load();
                    if (!this.seekHead.loaded)
                        return false;
                    break;

                case 0xEC: //VOid
                    if (!this.dataInterface.peekBytes(this.currentElement.size))
                        return false;
                    else
                        this.dataInterface.skipBytes(this.currentElement.size);

                    console.log("FOUND VOID, SKIPPING");
                    break;

                case 0x1549A966: //Info
                    if (!this.segmentInfo)
                        this.segmentInfo = new SegmentInfo(this.currentElement, this.dataInterface);
                    this.segmentInfo.load();
                    if (!this.segmentInfo.loaded)
                        return false;
                    break;

                case 0x1654AE6B: //Tracks
                    if (!this.tracks)
                        this.tracks = new Tracks(this.currentElement, this.dataInterface, this);
                    this.tracks.load();
                    if (!this.tracks.loaded)
                        return false;
                    break;

                case 0x1F43B675: //Cluster
                    if (!this.currentCluster){
                        var metaWasLoaded = this.loadedMetadata; 
                        this.currentCluster = new Cluster(this.currentElement, this.dataInterface, this);
                        if(this.loadedMetadata && !metaWasLoaded)
                            return true;
                    }
                    status = this.currentCluster.load();
                    if (!this.currentCluster.loaded){
                       return status;                      
                    }
                        
                    //this.clusters.push(this.currentCluster); //TODO: Don't overwrite this, make id's to keep track or something
                    this.currentCluster = null;
                    break;
                    
                case 0x1C53BB6B: //Cues
                    if (!this.cues)
                        this.cues = new Cues(this.currentElement, this.dataInterface , this);
                    this.cues.load();
                    if (!this.cues.loaded)
                        return false;
                    this.cuesLoaded = true;
                    break;

                default:
                    this.state = META_LOADED;//testing
                    return;
                    console.error("body element not found, skipping, id = " + this.currentElement.id);
                    break;

            }

            this.currentElement = null;
        }

        this.state = META_LOADED;
        return status;
    }

    /**
     * finds the beginnign of the segment. Should modify to allow level 0 voids, apparantly they are possible 
     */
    loadSegment() {
        console.log("loading seg");
        if (this.state !== HEADER_LOADED)
            console.error("HEADER NOT LOADED");

        if (!this.currentElement)
            this.currentElement = this.dataInterface.peekElement();

        if (!this.currentElement)
            return null;


        switch (this.currentElement.id) {

            case 0x18538067: // Segment
                this.segment = this.currentElement;
                //this.segmentOffset = segmentOffset;
                break;
            case 0xEC: // void
                if (this.dataInterface.peekBytes(this.currentElement.size))
                    this.dataInterface.skipBytes();
                else
                    return null;
                break;
            default:
                console.warn("Global element not found, id: " + this.currentElement.id);
        }


        this.currentElement = null;
        this.segmentIsLoaded = true;
        this.state = SEGMENT_LOADED;
    }

    loadHeader() {
        //Header is small so we can read the whole thing in one pass or just wait for more data if necessary


        //only load it if we didnt already load it
        if (!this.elementEBML) {
            this.elementEBML = this.dataInterface.peekElement();
            if (!this.elementEBML)
                return null;

            if (this.elementEBML.id !== 0x1A45DFA3) { //EBML 
                //If the header has not loaded and the first element is not the header, do not continue
                console.warn('INVALID PARSE, HEADER NOT LOCATED');
            }
        }

        while (this.dataInterface.offset < this.elementEBML.end) {
            if (!this.currentElement) {
                this.currentElement = this.dataInterface.peekElement();
                if (this.currentElement === null)
                    return null;
            }


            switch (this.currentElement.id) {

                case 0x4286: //EBMLVersion
                    var version = this.dataInterface.readUnsignedInt(this.currentElement.size);
                    if (version !== null)
                        this.version = version;
                    else
                        return null;
                    break;

                case 0x42F7: //EBMLReadVersion 
                    var readVersion = this.dataInterface.readUnsignedInt(this.currentElement.size);
                    if (readVersion !== null)
                        this.readVersion = readVersion;
                    else
                        return null;
                    break;

                case 0x42F2: //EBMLMaxIDLength
                    var maxIdLength = this.dataInterface.readUnsignedInt(this.currentElement.size);
                    if (maxIdLength !== null)
                        this.maxIdLength = maxIdLength;
                    else
                        return null;
                    break;

                case 0x42F3: //EBMLMaxSizeLength
                    var maxSizeLength = this.dataInterface.readUnsignedInt(this.currentElement.size);
                    if (maxSizeLength !== null)
                        this.maxSizeLength = maxSizeLength;
                    else
                        return null;
                    break;

                case 0x4282: //DocType
                    var docType = this.dataInterface.readString(this.currentElement.size);
                    if (docType !== null)
                        this.docType = docType;
                    else
                        return null;
                    break;

                case 0x4287: //DocTypeVersion //worked
                    var docTypeVersion = this.dataInterface.readUnsignedInt(this.currentElement.size);
                    if (docTypeVersion !== null)
                        this.docTypeVersion = docTypeVersion;
                    else
                        return null;
                    break;

                case 0x4285: //DocTypeReadVersion //worked
                    var docTypeReadVersion = this.dataInterface.readUnsignedInt(this.currentElement.size);
                    if (docTypeReadVersion !== null)
                        this.docTypeReadVersion = docTypeReadVersion;
                    else
                        return null;
                    break;
                default:
                    console.warn("Header element not found, skipping");
                    break;

            }

            this.currentElement = null;
        }

        this.headerIsLoaded = true;
        this.state = HEADER_LOADED;
    }

    dequeueAudioPacket(callback) {
        //console.warn("Dequeing audio");
        
        if (this.audioPackets.length) {
            var packet = this.audioPackets.shift().data;
            callback(packet);
        } else {
            callback(null);
        }
    }

    /**
     * Dequeue and return a packet off the video queue
     * @param {function} callback after packet removal complete
     */
    dequeueVideoPacket(callback) {
        if (this.videoPackets.length) {
            var packet = this.videoPackets.shift().data;
            callback(packet);
        } else {
            callback(null);
        }
    }

    /**
     * Clear the current packet buffers and reset the pointers for new read position.
     * Should only need to do this once right before we send a seek request.
     * 
     * Needs to be cleaned up, Don't call so many times
     * @param {function} callback after flush complete
     */
    flush(callback) {
        console.error("flushing");
        if (!this.isSeeking) {
            
            this.audioPackets = [];
            this.videoPackets = [];
            this.dataInterface.flush();
            this.currentElement = null; 
        }
           
        
        //Note: was wrapped in a time function but the callback doesnt seem to take that param
         
        //console.log(this);
        //throw "TEST";
        callback();
    }
    
    /**
     * Depreciated, don't use!
     * @param {number} timeSeconds
     * @param {function} callback
     */
    getKeypointOffset(timeSeconds, callback) {
        var offset = this.time(function () {
            
            return -1; // not used
            
        }.bind(this));
        
        callback(offset);
    }

    /*
     * @param {number} timeSeconds seconds to jump to
     * @param {function} callback 
     */
    seekToKeypoint(timeSeconds, callback) {
        var ret = this.time(function () {
            
            /*
             * idea: Use to seek directly to point
             * -check if cues loaded
             * -- if not initCues
             * 
             * -calculate keypoint offset
             * -flush
             * -Seek to keypoint
             * -continue loading as usual
             * 
             */
            
            
            //Don't pay attention to rest for now
            return 0;
            //}
            if(!this.isSeeking){
                console.warn("seek already initialized");
                return 1;
            }
            
            this.isSeeking = true;
            this.tempSeekPosition = timeSeconds;
            //seek to time in seconds * 1000
            console.warn("seeking to " + timeSeconds*1000);
            //if the cues are not loaded, look in the seek head
            if(!this.cuesLoaded){
                console.warn(this.segment.dataOffset);
                
                var length = this.seekHead.entries.length;
                var entries = this.seekHead.entries;
                console.warn(this.seekHead);
                var seekOffset;
                //Todo : make this less messy
                for (var i = 0; i < length ; i ++){
                    if(entries[i].seekId === 0x1C53BB6B) // cues
                        seekOffset =  entries[i].seekPosition + this.segment.dataOffset; // its the offset from data offset
                }
                this.dataInterface.offset = seekOffset;
                this.onseek(seekOffset);
                
                
            }
            
            return 1; // always return 1?
        }.bind(this));

        callback(!!ret);
    }
    
    /**
     * Immedietly seek to position, used for restarting stream or when switching resolutions.
     * I think this might be the fast seek
     * @param {number} timeSeconds
     * @param {function} callback
     */
    seekTo(timeSeconds, callback) {

    }

    /**
     * Called when the user drags the slider, can init the seek loading.
     * Use this for scrubbing, can have a different preview algorithm
     * check if cues loaded, if not do cues init
     * @param {number} timeSeconds
     * @param {function} callback
     */
    onScrub(timeSeconds, callback){
    }
    
    /**
     * If cues are not yet loaded at this point (should have been at least started to load)
     * Save the desired location anyway, on the next process call when the cues are loaded jump to it
     * @param {number} timeSeconds
     * @param {function} callback
     * When done scrubbing, reinitialize the stream here.
     */
    onScrubEnd(timeSeconds, callback){
        console.warn("End seek triggered");
     
            //should flush before restarting
            var seekOffset = 4452; //hardcoded testing
            //this.dataInterface.offset = seekOffset;
            this.isSeeking = false;
            this.onseek(seekOffset);
            console.log(this);
    }
    
    /**
     * Possibly use this to initialize cues if not loaded, can be called from onScrub or seekTo
     * Send seek request to cues, then make it keep reading bytes and waiting until cues are loaded
     * @returns {undefined}
     */
    initCues(){
        
    }
    
    /**
     * Get the offset based off the seconds, probably use binary search and have to parse the keypoints to numbers
     * @param {number} timeSeconds
     * @returns {number} offset in bytes relative to cluster, or file, doesnt matter since we save the cluster offset anyway.
     */
    calculateKeypointOffset(timeSeconds){
        
    }

}








module.exports = OGVDemuxerWebM;
