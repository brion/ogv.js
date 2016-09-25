'use strict';
/**
 * @classdesc This class keeps a queue of arraybuffers in order for demuxer to read continuously without having to overwrite anything
 * 
 */

var INITIAL_COUNTER = -1;

class DataInterface{
    
    constructor(){
        
        this.overallPointer = 0;
        this.internalPointer = 0;
        this.dataBuffers = [];
        this.currentBuffer = null;
        this.markerPointer = 0;
        this.tempFloat64 = new DataView(new ArrayBuffer(8));
        this.tempFloat32 = new DataView(new ArrayBuffer(4));
        this.tempBinaryBuffer = null;
        
        Object.defineProperty(this, 'markerBytesRead' , {
            get: function(){
                return this.markerPointer;
            }
        });
        
        Object.defineProperty(this, 'offset' , {
            get: function(){
                return this.overallPointer;
            },
            
            set: function(offset){
                this.overallPointer = offset;
            }
        });
        
 
        this.tempElementOffset = null;
        this.tempElementDataOffset = null;
        this.tempSize = null;
        this.tempOctetWidth = null;
        this.tempOctet = null;
        this.tempByteBuffer = 0;
        this.tempByteCounter = 0;
        this.tempElementId = null;
        this.tempElementSize = null;
        this.tempVintWidth = null;
        this.tempResult = null;
        this.tempCounter = INITIAL_COUNTER;
        this.usingBufferedRead = false;
        
        /**
         * Returns the bytes left in the current buffer
         */
        Object.defineProperty(this, 'remainingBytes' , {

            get: function () {
                if (this.dataBuffers.length === 0)
                    return 0;
                else
                    return this.currentBuffer.byteLength - this.internalPointer;
            }
            
        });
        
        
    }
    
    flush(){
        this.dataBuffers = [];
        this.tempElementOffset = null;
        this.tempElementDataOffset = null;
        this.tempSize = null;
        this.tempOctetWidth = null;
        this.tempOctet = null;
        this.tempByteBuffer = 0;
        this.tempByteCounter = 0;
        this.tempElementId = null;
        this.tempElementSize = null;
        this.tempVintWidth = null;
        this.tempResult = null;
        this.tempCounter = INITIAL_COUNTER;
        this.usingBufferedRead = false;
    }
    
    recieveInput(data){
        this.dataBuffers.push(new DataView(data));
        if (this.dataBuffers.length === 1) {
            this.currentBuffer = this.dataBuffers[0];
            this.internalPointer = 0;
        }
            
    }
    
    popBuffer(){
        if(this.dataBuffers.length === 0)
            return;
        this.dataBuffers.shift();
        this.internalPointer = 0;
        //this.internalPointer = 0;
        if(this.dataBuffers.length !== 0){
            this.currentBuffer = this.dataBuffers[0];
            
        }else{
            this.currentBuffer = null;
        }
    }
    
    readId(){
         if(this.dataBuffers.length === 0)
            return null; //Nothing to parse
 
        if (!this.tempOctet) {
            
            if (!this.currentBuffer)// if we run out of data return null
                return null; //Nothing to parse
            
            this.tempElementOffset = this.overallPointer; // Save the element offset
            this.tempOctet = this.currentBuffer.getUint8(this.internalPointer);
            this.incrementPointers();
            this.tempOctetWidth = this.calculateOctetWidth();
            
                    
            if (this.remainingBytes === 0)
                this.popBuffer();       

        }
        
        //We will have at least one byte to read
        var tempByte;
        if(!this.tempByteCounter)
            this.tempByteCounter = 0;
        
        while (this.tempByteCounter < this.tempOctetWidth) {
            
            if (!this.currentBuffer)// if we run out of data return null
                return null; //Nothing to parse 
            
            if (this.tempByteCounter === 0) {
                this.tempByteBuffer = this.tempOctet;
            } else {
                tempByte = this.readByte();
                this.tempByteBuffer = (this.tempByteBuffer << 8) | tempByte;
            }

            
            this.tempByteCounter++;
            
            if (this.remainingBytes === 0)
                this.popBuffer();
            
        }
        
        var result = this.tempByteBuffer;
        
        
        this.tempOctet = null;
        this.tempByteCounter = null;
        this.tempByteBuffer = null;
        this.tempOctetWidth = null;
        
        return result;       
    }
    
    readVint() {

        if(this.dataBuffers.length === 0)
            return null; //Nothing to parse
  
        if (!this.tempOctet) {
            
            if (!this.currentBuffer)// if we run out of data return null
                return null; //Nothing to parse
            
            this.tempOctet = this.currentBuffer.getUint8(this.internalPointer);
            this.incrementPointers();
            this.tempOctetWidth = this.calculateOctetWidth();
            
                    
            if (this.remainingBytes === 0)
                this.popBuffer();

        }
        
        if(!this.tempByteCounter)
            this.tempByteCounter = 0;
        var tempByte;
        while (this.tempByteCounter < this.tempOctetWidth) {
            
            if (!this.currentBuffer)// if we run out of data return null
                return null; //Nothing to parse
            
            if (this.tempByteCounter === 0) {
                var mask = ((0xFF << this.tempOctetWidth) & 0xFF) >> this.tempOctetWidth;
                this.tempByteBuffer = this.tempOctet & mask;
            } else {
                tempByte = this.readByte();
                this.tempByteBuffer = (this.tempByteBuffer << 8) | tempByte;
            }
    
            
            this.tempByteCounter++;
            
            if (this.remainingBytes === 0)
                this.popBuffer();
            
        }

        var result = this.tempByteBuffer;
        this.tempOctet = null;
        this.tempOctetWidth = null;
        this.tempByteCounter = null;
        this.tempByteBuffer = null;
        return result;
        
    }
    
    /**
     * Use this function to read a vint with more overhead by saving the state on each step
     * @returns {number | null}
     */
    bufferedReadVint(){
        
        //We will have at least one byte to read
        var tempByte;
        
        if(!this.tempByteCounter)
            this.tempByteCounter = 0;
        
        while (this.tempByteCounter < this.tempOctetWidth) {
            
            if (!this.currentBuffer)// if we run out of data return null
                return null; //Nothing to parse
            
            if (this.tempByteCounter === 0) {
                var mask = ((0xFF << this.tempOctetWidth) & 0xFF) >> this.tempOctetWidth;
                this.tempByteBuffer = this.tempOctet & mask;
            } else {
                tempByte = this.readByte();
                this.tempByteBuffer = (this.tempByteBuffer << 8) | tempByte;
            }
    
            
            this.tempByteCounter++;
            
            if (this.remainingBytes === 0)
                this.popBuffer();
            
        }
        
        var result = this.tempByteBuffer;
        
        
        this.tempByteCounter = null;
        this.tempByteBuffer = null;
        return result;
        
    }
    
    clearTemps() {
        this.tempId = null;
        this.tempSize = null;
        this.tempOctetMask = null;
        this.tempOctetWidth = null;
        this.tempOctet = null;
        this.tempByteBuffer = 0;
        this.tempByteCounter = 0;
        this.usingBufferedRead = false;
    }
    
    /**
     * Use this function to implement a more efficient vint reading if there are enough bytes in the buffer
     * @returns {Number|null} 
     */
    forceReadVint() {
        
        var result;
        switch (this.tempOctetWidth) {
            case 1:
                result = this.tempOctet & 0x7F;
                break;
            case 2:
                result = this.tempOctet & 0x3F;
                result = (result << 8) | this.currentBuffer.getUint8(this.internalPointer);
                this.incrementPointers();
                break;
            case 3:
                result = this.tempOctet & 0x1F;
                result = (result << 16) | this.currentBuffer.getUint16(this.internalPointer);
                this.incrementPointers(2);
                break;
            case 4:
                result = this.tempOctet & 0x0F;
                result = (result << 16) | this.currentBuffer.getUint16(this.internalPointer);
                this.incrementPointers(2);
                result = (result << 8) | this.currentBuffer.getUint8(this.internalPointer);
                this.incrementPointers();
                break;
            case 5:
                console.warn("finish this");
                break;
            case 6:
                /* fix this */
                console.warn("finish this");
                break;
            case 7:
                /* fix this */
                console.warn("finish this");
                break;
            case 8:
                result = this.tempOctet & 0x00;
                //Largest allowable integer in javascript is 2^53-1 so gonna have to use one less bit for now
                result = (result << 8) | this.currentBuffer.getUint8(this.internalPointer);
                this.incrementPointers();
                result = (result << 16) | this.currentBuffer.getUint16(this.internalPointer);
                this.incrementPointers(2);
                result = (result << 32) | this.currentBuffer.getUint32(this.internalPointer);
                this.incrementPointers(4);
                break;
        }

        if (this.remainingBytes === 0)
            this.popBuffer();

        this.tempOctetWidth = null;
        this.tempOctet = null;
        return result;
    }
    
    
    readByte(){
        if(!this.currentBuffer){
            console.error("READING OUT OF BOUNDS");
    
        }
            
        var byteToRead = this.currentBuffer.getUint8(this.internalPointer);
        this.incrementPointers();
        //if (this.remainingBytes === 0)
          //      this.popBuffer();
            
        return byteToRead;
    }
    
    readSignedByte(){
        if(!this.currentBuffer)
            console.error('READING OUT OF BOUNDS');
        var byteToRead = this.currentBuffer.getInt8(this.internalPointer);
        this.incrementPointers();
        if (this.remainingBytes === 0)
                this.popBuffer();
            
        return byteToRead;
    }
    
    peekElement(){

        if(this.dataBuffers.length === 0)
            return null; //Nothing to parse
        
        //check if we return an id
        if (!this.tempElementId){
            this.tempElementId = this.readId();
            if(this.tempElementId === null)
                return null;
        }
        
        
        if (!this.tempElementSize) {
            this.tempElementSize = this.readVint();
            if (this.tempElementSize === null)
                return null;
        }
        
        var element = new ElementHeader(this.tempElementId , this.tempElementSize, this.tempElementOffset, this.overallPointer);
        
        //clear the temp holders
        this.tempElementId = null;
        this.tempElementSize = null;
        this.tempElementOffset = null;
        
        
        return element;
                
    }
    
    /*
     * Check if we have enough bytes available in the buffer to read
     * @param {number} n test if we have this many bytes available to read
     * @returns {boolean} has enough bytes to read
     */
    peekBytes(n){
        if(this.dataBuffers.length === 0)
            return false; //No bytes
        //
        //First check if the first buffer has enough remaining bytes, don't need to loop if this is the case
        var currentBufferBytes = this.currentBuffer.byteLength - this.internalPointer - n;
        //If we have enough in this buffer just return true
        if(currentBufferBytes >= 0)
            return true;
        
        var totalBytes = this.getTotalBytes();
        if((totalBytes - this.internalPointer - n) >= 0)
            return true;
        else 
            return false;
    }
    
    /**
     * Skips set amount of bytes
     * TODO: Make this more efficient with skipping over different buffers, add stricter checking
     * @param {number} bytesToSkip
     */
    skipBytes(bytesToSkip) {

        var chunkToErase = 0;
        var counter = 0;
        while (counter < bytesToSkip) {

            if (!this.currentBuffer)
                throw "Invalid Skip Length";


            if ((bytesToSkip - counter) > this.remainingBytes) {
                chunkToErase = this.remainingBytes;
            } else {
                chunkToErase = bytesToSkip - counter;
            }


            this.incrementPointers(chunkToErase);


            if (this.remainingBytes === 0) {
                this.popBuffer();
            }


            counter += chunkToErase;

        }

    }
    
    getTotalBytes() {
        var totalBytes = 0;
        var length = this.dataBuffers.length;
        for (var i = 0; i < length; i++) {
            totalBytes += this.dataBuffers[i].byteLength;
        }
        return totalBytes;
    }
    
    getRemainingBytes(){
        if (!this.currentBuffer)
            return 0;
        return this.currentBuffer.byteLength - this.internalPointer;
    }
     
    calculateOctetWidth(){
        var leadingZeroes = 0;
        var zeroMask = 0x80;
        do {
            if (this.tempOctet & zeroMask)
                break;

            zeroMask = zeroMask >> 1;
            leadingZeroes++;

        } while (leadingZeroes < 8);

        //Set the width of the octet
        return leadingZeroes + 1;
    }
    
    incrementPointers(n) {
        var bytesToAdd = n || 1;
        this.internalPointer += bytesToAdd;
        this.overallPointer += bytesToAdd;
    }
    
    readUnsignedInt(size){
        
        if (!this.currentBuffer)// if we run out of data return null
                return null; //Nothing to parse
            
        //need to fix overflow for 64bit unsigned int
        if ( size <= 0 || size > 8) {
            console.warn("invalid file size");
        }
  
        if(this.tempResult === null)
            this.tempResult = 0;

        if (this.tempCounter === INITIAL_COUNTER)
            this.tempCounter = 0;

        var b;

        var tempCounter = this.tempCounter;
        var tempResult = this.tempResult;
        
        while (tempCounter < size) {

            if (!this.currentBuffer){// if we run out of data return null
                //save progress;
                this.tempCounter = tempCounter;
                this.tempResult = tempResult;
                return null; //Nothing to parse
            }

            b = this.readByte();

            if (tempCounter === 0 && b < 0) {
                console.warn("invalid integer value");
            }


            tempResult <<= 8;
            tempResult |= b;

            if (this.remainingBytes === 0)
                this.popBuffer();
            
            tempCounter++;
        }

        //clear the temp resut
        //var result = this.tempResult;
        this.tempResult = null;
        this.tempCounter = INITIAL_COUNTER;
        return tempResult;
    }

    readSignedInt(size) {
        
        if (!this.currentBuffer)// if we run out of data return null
                return null; //Nothing to parse
            
        //need to fix overflow for 64bit unsigned int
        if ( size <= 0 || size > 8) {
            console.warn("invalid file size");
        }
           
        if(this.tempResult === null)
            this.tempResult = 0;

        if (this.tempCounter === INITIAL_COUNTER)
            this.tempCounter = 0;

        var b;

        while (this.tempCounter < size) {

            if (!this.currentBuffer)// if we run out of data return null
                return null; //Nothing to parse

            

            if (this.tempCounter === 0)
                b = this.readByte();
            else
                b = this.readSignedByte();



            this.tempResult <<= 8;
            this.tempResult |= b;

            if (this.remainingBytes === 0)
                this.popBuffer();
            
            this.tempCounter++;
        }

        //clear the temp resut
        var result = this.tempResult;
        this.tempResult = null;
        this.tempCounter = INITIAL_COUNTER;
        return result;
    }
    
    readString(size) {
        if (!this.tempString)
            this.tempString = '';
        
        if (this.tempCounter === INITIAL_COUNTER)
            this.tempCounter = 0;
        
        var tempString = '';
        while (this.tempCounter < size) {

            if (!this.currentBuffer){// if we run out of data return null
                //save progress
                this.tempString = tempString;
                return null; //Nothing to parse
            }

            //this.tempString += String.fromCharCode(this.readByte());
            tempString += String.fromCharCode(this.readByte());
            
            if (this.remainingBytes <= 0)
                this.popBuffer();

            this.tempCounter++;
        }
        
        //var tempString = this.tempString;
        this.tempString = null;
        this.tempCounter = INITIAL_COUNTER;
        return tempString;
    }
    
    readFloat(size) {

        if (size === 8) {
            
            
            if (this.tempCounter === INITIAL_COUNTER)
                this.tempCounter = 0;

            if (this.tempResult === null){
                this.tempResult = 0;
                this.tempFloat64.setFloat64(0, 0);
            }
                

            var b;

            while (this.tempCounter < size) {

                if (!this.currentBuffer)// if we run out of data return null
                    return null; //Nothing to parse



                b = this.readByte();

                this.tempFloat64.setUint8(this.tempCounter, b);

                if (this.remainingBytes === 0)
                    this.popBuffer();

                this.tempCounter++;
            }
            
            this.tempResult = this.tempFloat64.getFloat64(0);


        } else if (size === 4) {
            throw "implement this!";
        } else {
            throw "INVALID FLOAT LENGTH";
        }

        //clear the temp resut
        var result = this.tempResult;
        this.tempResult = null;
        this.tempCounter = INITIAL_COUNTER;
        return result;
    }
    
    /**
     * Returns a new buffer with the length of data starting at the current byte buffer
     * @param {number} length Length of bytes to read
     * @returns {ArrayBuffer} the read data
     */
    getBinary(length){
        
        if (length < 0)
            throw "INVALID SIZE";
        
        if(this.usingBufferedRead && this.tempCounter === null){
            throw "COUNTER WAS ERASED";
        }
        //Entire element contained in 1 array
        if(this.remainingBytes >= length && !this.usingBufferedRead){
            
            var newBuffer = this.currentBuffer.buffer.slice(this.internalPointer, this.internalPointer + length);
            
            if(newBuffer.byteLength !== length)
                throw "INVALID NEW BUFFER!";
            
            this.incrementPointers(length);
            if (this.remainingBytes === 0)
                this.popBuffer();
            return newBuffer;
            
        } 
        
        
        var test = this.offset;
        var tempRemainingBytes = this.remainingBytes;

        if (this.usingBufferedRead === false && this.tempCounter > 0)
            throw "INVALID BUFFERED READ";//at this point should be true
        
        //data is broken up across different arrays
        //TODO: VERY SLOW, FIX THIS!!!!!!!!!!
        this.usingBufferedRead = true;
        
        if(!this.tempBinaryBuffer)
            this.tempBinaryBuffer = new Uint8Array(new ArrayBuffer(length));
        
        if (this.tempCounter === INITIAL_COUNTER)
            this.tempCounter = 0;
        
        var bytesToCopy = 0;       
        var tempBuffer;
        while (this.tempCounter < length) {

            if (!this.currentBuffer) {
                if (this.usingBufferedRead === false)
                    throw "INVALID return  case";//at this point should be true
                return null; //Nothing to parse
            }

            if((length - this.tempCounter) > this.remainingBytes){
                bytesToCopy = this.remainingBytes;
            }else{
                bytesToCopy = length - this.tempCounter;
            }
           
            tempBuffer = new Uint8Array(this.currentBuffer.buffer , this.internalPointer, bytesToCopy);
            this.tempBinaryBuffer.set(tempBuffer , this.tempCounter);
            this.incrementPointers(bytesToCopy);
            //b = this.readByte();
            
            //this.tempBinaryBuffer.setUint8(this.tempCounter, b);



            if (this.remainingBytes === 0) {
                this.popBuffer();
            }


            this.tempCounter += bytesToCopy;
        }
        
        var tempBinaryBuffer = this.tempBinaryBuffer;
        this.tempBinaryBuffer = null;
        this.tempCounter = INITIAL_COUNTER;
        this.usingBufferedRead = false;
        return tempBinaryBuffer.buffer;

        
    }
    
    
    
}


/**
 * @classdesc A class to handle managment of matroska elements
 */
class ElementHeader{
    
    /**
     * 
     * @param {number} id the element id
     * @param {number} size the size of the payload
     * @param {number} offset the offset in the file
     * @param {number} dataOffset the offset of the payload
     */
    constructor(id, size , offset, dataOffset){
        this.id = id;
        this.size = size;
        this.headerSize;
        this.offset = offset;
        this.dataOffset = dataOffset;
        this.end = dataOffset + size;
    }
    
}

module.exports = DataInterface;