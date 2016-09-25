'use strict';


class SeekHead {

    constructor(seekHeadHeader , dataInterface) {
        this.dataInterface = dataInterface;
        this.offset = seekHeadHeader.offset;
        this.size = seekHeadHeader.size;
        this.end = seekHeadHeader.end;
        this.entries = [];
        this.entryCount = 0;
        this.voidElements = [];
        this.voidElementCount = 0;
        this.loaded = false;  
        this.tempEntry = null;
        this.currentElement = null;
    }
    
    load() {
        var end = this.end;
        while (this.dataInterface.offset < end) {
            if (!this.currentElement) {
                this.currentElement = this.dataInterface.peekElement();
                if (this.currentElement === null)
                    return null;
            }


            switch (this.currentElement.id) {

                case 0x4DBB: //Seek
                    if (!this.tempEntry)
                        this.tempEntry = new Seek(this.currentElement, this.dataInterface);
                    this.tempEntry.load();
                    if (!this.tempEntry.loaded)
                        return;
                    else 
                        this.entries.push(this.tempEntry);
                    break;
                    //TODO, ADD VOID
                default:
                    console.warn("Seek Head element not found");
                    break;

            }
            
            this.tempEntry = null;
            this.currentElement = null;
        }
        

        if (this.dataInterface.offset !== this.end){
            console.log(this);
            throw "INVALID SEEKHEAD FORMATTING"
        }
        

        this.loaded = true;
    }

}

class Seek{
    
    constructor(seekHeader, dataInterface) {
        this.size = seekHeader.size;
        this.offset = seekHeader.offset;
        this.end = seekHeader.end;
        this.dataInterface = dataInterface;
        this.loaded = false;
        this.currentElement = null;
        this.seekId = -1;
        this.seekPosition = -1;
    }
    
    load(){

        while (this.dataInterface.offset < this.end) {
            if (!this.currentElement) {
                this.currentElement = this.dataInterface.peekElement();
                if (this.currentElement === null)
                    return null;
            }


            switch (this.currentElement.id) {

                case 0x53AB: //SeekId
                    var seekId = this.dataInterface.readUnsignedInt(this.currentElement.size);
                    if (seekId !== null)
                        this.seekId = seekId;
                    else
                        return null;
                    break;

                case 0x53AC: //SeekPosition 
                    var seekPosition = this.dataInterface.readUnsignedInt(this.currentElement.size);
                    if (seekPosition !== null)
                        this.seekPosition = seekPosition;
                    else
                        return null;
                    break;
 
                default:
                    console.warn("Seek element not found, skipping");
                    break;

            }
            
            this.currentElement = null;
        }
        
        if(this.dataInterface.offset !== this.end)
            console.error("Invalid Seek Formatting");

        this.loaded = true;
    }
    
}
module.exports = SeekHead;