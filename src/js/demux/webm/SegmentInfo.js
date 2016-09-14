'use strict';
const NO_MARKER = -1;

class SegmentInfo {

    constructor(infoHeader, dataInterface) {
        this.dataInterface = dataInterface;
        this.offset = infoHeader.offset;
        this.size = infoHeader.size;
        this.muxingApp = null;
        this.writingApp = null;
        this.title = null;
        this.dataOffset = null;
        this.timecodeScale = 1000000;
        this.duration = -1;
        this.loaded = false;
        this.marker = NO_MARKER;
        this.segmentUID = null;
        this.duration = null;

    }

    load() {
        console.warn("loading segment info");
        if (this.marker === NO_MARKER)
            this.marker = this.dataInterface.setNewMarker();
var test;
        while (this.dataInterface.getMarkerOffset(this.marker) < this.size) {
            test = this.dataInterface.getMarkerOffset(this.marker);
            
            if (!this.currentElement) {
                this.currentElement = this.dataInterface.peekElement();
                if (this.currentElement === null)
                    return null;
            }


            switch (this.currentElement.id) {
                //TODO add duration and title
                case 0x2AD7B1: //TimeCodeScale
                    var timecodeScale = this.dataInterface.readUnsignedInt(this.currentElement.size);
                    if (timecodeScale !== null)
                        this.timecodeScale = timecodeScale;
                    else
                        return null;
                    break;

                case 0x4D80: //Muxing App 
                    var muxingApp = this.dataInterface.readString(this.currentElement.size);
                    if (muxingApp !== null)
                        this.muxingApp = muxingApp;
                    else
                        return null;
                    break;
                case 0x5741: //writing App 
                    var writingApp = this.dataInterface.readString(this.currentElement.size);
                    if (writingApp !== null)
                        this.writingApp = writingApp;
                    else
                        return null;
                    break;

                case 0x7BA9: //title
                    var title = this.dataInterface.readString(this.currentElement.size);
                    if (title !== null)
                        this.title = title;
                    else
                        return null;
                    break;
                    
                case 0x73A4: //segmentUID
                    //TODO, LOAD THIS AS A BINARY ARRAY, SHOULD BE 128 BIT UNIQUE ID
                    var segmentUID = this.dataInterface.readString(this.currentElement.size);
                    if (segmentUID !== null)
                        this.segmentUID = segmentUID;
                    else
                        return null;
                    break;
                    
                case 0x4489: //duration MUST BE FLOAT
                    var duration = this.dataInterface.readUnsignedInt(this.currentElement.size);
                    if (duration !== null)
                        this.duration = duration;
                    else
                        return null;
                    break;
                    
                default:
                    console.error("Ifno element not found, skipping : " + this.currentElement.id);
                    break; 

            }
            test = this.dataInterface.getMarkerOffset(this.marker);
            this.currentElement = null;
        }

        if(this.dataInterface.getMarkerOffset(this.marker) !== this.size)
            console.error("Invalid SegmentInfo Formatting");
            
        this.dataInterface.removeMarker(this.marker);
        this.marker = NO_MARKER;
        this.loaded = true;
    }

    parse() {
        console.log("parsing segment info");
        var end = this.dataOffset + this.size;
        var offset = this.dataOffset;

        var elementId;
        var elementSize;
        var elementOffset;
        this.timecodeScale = 1000000;
        this.duration = -1;

        while (offset < end) {

            elementOffset = offset;
            elementId = VINT.read(this.dataView, offset);
            offset += elementId.width;
            elementSize = VINT.read(this.dataView, offset);
            offset += elementSize.width;


            switch (elementId.raw) {

                case 0x2AD7B1: // TimecodeScale
                    this.timecodeScale = OGVDemuxerWebM.readUnsignedInt(this.dataView, offset, elementSize.data);
                    if (this.timecodeScale <= 0)
                        console.warn("Invalid timecode scale");
                    break;
                case 0x4489: // Duration
                    this.duration = OGVDemuxerWebM.readFloat(this.dataView, offset, elementSize.data);
                    if (this.duration <= 0)
                        console.warn("Invalid duration");
                    break;
                case 0x4D80: // MuxingApp
                    this.muxingApp = OGVDemuxerWebM.readString(this.dataView, offset, elementSize.data);
                    break;
                case 0x5741: //WritingApp
                    this.writingApp = OGVDemuxerWebM.readString(this.dataView, offset, elementSize.data);

                    break;
                case 0x7BA9:  //Title                   
                    this.title = OGVDemuxerWebM.readString(this.dataView, offset, elementSize.data);
                    break;
                default:
                    console.warn("segment info element not found");
                    break;

            }




            offset += elementSize.data;

        }

    }

}

module.exports = SegmentInfo;