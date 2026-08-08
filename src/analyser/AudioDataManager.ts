import { NumberWrapperTypes, BigIntWrappers, NonBigIntWrappers, Int8, Int16, Int32, Int64, Uint8, Uint16, Uint32, Uint64, Float16, Float32, Float64 } from "../utils/numberWrappers";

type HeaderLayoutMember = {
    byteOffset: number;
    Wrapper: NumberWrapperTypes;
};
type HeaderLayout = Readonly<
    Record<keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"], HeaderLayoutMember>
>;

type IOValueForKey<K extends keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]> =
    IOValueFor<typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"][K]> 
;
type IOValueFor<
    Wrapper extends typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"][keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]]
> = WrapperValue<Wrapper>;
type WrapperValue<T extends NumberWrapperTypes> = T extends BigIntWrappers
    ? bigint
    : T extends NonBigIntWrappers
        ? number
        : never;

export type Process = Float32Array[][];

export type ProcessInfo = {
    index: InstanceType<typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]["processHeadIndex"]>,
    totalSampleCount: Uint64,
    sampleFrameLength: Float32,
    inputs: {
        channelCount: Uint8
    }[]
};

// NOTE: In the future, the sample-frame sizes of data blocks may change over time, according to MDN

/**
 * Handles reads and writes to a buffer containing raw audio data.
 * 
 * The HeaderLayout is a predefined structure of data, and such data may be modified at runtime.
 * 
 * The body comes after HeaderLayout, where process blocks contain all audio data (samples of channels per input) preceeded by the sample count.
 * 
 * The body is a circular buffer. The consumer (another thing that will read the audio data) should continuously read new process data blocks until it has enough samples. Missing reading some process blocks should be fine for simple visualization.
 * 
 * Process block layout:
 * 
 * (process-spacer-start) | sample frame length | --Input-- (spacer) ... (spacer) | (process-spacer-end)
 */
export default class AudioDataManager {
    public static readonly HEADER_LAYOUT_WRAPPERS = Object.freeze({
        /** Index DIRECTLY AFTER the latest process-block's "processSpacerEnd" flag */
        processHeadIndex: Uint32,
        /** Sample rate from the AudioContext */
        sampleRate: Float32,
        /** Ever-increasing context time of the audio block being processed */
        currentTime: Float64,
        /**
         * Ever-increasing current sample-frame of the audio block being processed,
         * incremented by the size of a render quantum after the processing of each audio block.
         */
        currentFrame: Uint64,
        /**
         * The last sample-frame where the audio data was used by something, typically set after
         * the desired sample-frame count for FFT is reached.
         */
        previousConsumeFrame: Uint64,
        /** fftSize: 2^n */
        fftRatio: Uint8
    });
    public static readonly FFT_RATIO_MIN = new AudioDataManager["HEADER_LAYOUT_WRAPPERS"]["fftRatio"](5);
    public static readonly FFT_RATIO_MAX = new AudioDataManager["HEADER_LAYOUT_WRAPPERS"]["fftRatio"](15);

    public static HEADER_SIZE: number;
    public static HEADER_LAYOUT: Readonly<HeaderLayout>;
    static {
        const wrappers = AudioDataManager.HEADER_LAYOUT_WRAPPERS;
        const obj = {} as Record<keyof typeof wrappers, HeaderLayoutMember>;
        let byteOffset = 0;

        const entries = Object.entries(wrappers);
        for (let i=0; i<entries.length; i++) {
            const name = entries[i][0] as keyof typeof wrappers;
            const Wrapper = entries[i][1];
            obj[name] = { byteOffset, Wrapper };
            byteOffset += Wrapper.BYTES;
        }

        AudioDataManager.HEADER_LAYOUT = Object.freeze(obj);
        AudioDataManager.HEADER_SIZE = byteOffset;
    }

    public static readonly RESERVED_BODY_VALUES = AudioDataManager.createRSBVEnum("processSpacerStart", "processSpacerEnd", "inputSpacer");

    /**
     * Creates enum-like object in the range of [2.0, Infinity). The last inputted value will be the greatest
     * @param values 
     * @returns 
     */
    private static createRSBVEnum<T extends string[]>(...values: T): Readonly<Record<T[number], number>> {
        const customEnum = {} as Record<T[number], number>;
        let nextValue = new Float32(2.0);
        for (const name of values) {
            customEnum[name as T[number]] = nextValue.value;
            nextValue.value += 1.0;
        }
        return Object.freeze(customEnum);
    }

    /** Accesses Header data */
    private view: DataView;
    /** Accesses body data */
    private arr: Float32Array<ArrayBufferLike>;

    constructor(buf: ArrayBufferLike) {
        const hdrSize = AudioDataManager.HEADER_SIZE;
        this.view = new DataView(buf, 0, hdrSize);

        const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;
        const arrOffset = hdrSize + FLOAT_SIZE - (hdrSize % FLOAT_SIZE);
        const arrLength = Math.floor((buf.byteLength - arrOffset) / FLOAT_SIZE);
        this.arr = new Float32Array(buf, arrOffset, arrLength);
    }

    /**
     * Estimate a generous size for the buffer in bytes
     * @param inputCount
     * @param maxChannelCount Based on audio format (mono, stereo, surround, etc.)
     */
    public static estimateBufSize(inputCount: number = 2, maxChannelCount: number = 2): number {
        const FLOAT_SIZE = Float32.BYTES;
        const headerSize = AudioDataManager.HEADER_SIZE;

        const fftSize = 2 ** Number(AudioDataManager["FFT_RATIO_MAX"].value);
        const maxSampleFrameLength = 512;
        const processLength = inputCount * maxChannelCount * maxSampleFrameLength;
        const minBodySize = Math.ceil(fftSize / processLength) * processLength * FLOAT_SIZE;

        return headerSize + (minBodySize * 5);
    }

    /**
     * Convenience method for setting all necessary values for the header
     */
    public initHeader(sampleRate: number, fftRatio: number): void {
        this.setHeader({
            processHeadIndex: 0,
            sampleRate,
            currentTime: 0.0,
            currentFrame: 0n,
            previousConsumeFrame: 0n,
            fftRatio
        });
    }

    public setHeader<
        K extends keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"],
        T extends Partial<{ [Key in keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]]: IOValueForKey<Key> }>
    >(data: T): void {
        for (let [key, value] of Object.entries(data) as [K, IOValueForKey<K>][]) {
            if (key === "fftRatio") {
                const minRatio = AudioDataManager["FFT_RATIO_MIN"].value;
                const maxRatio = AudioDataManager["FFT_RATIO_MAX"].value;
                value = Math.min(Math.max(minRatio, value as number), maxRatio) as IOValueForKey<K>;
            }
            this.callHeaderViewMethod("set", key, value);
        }
    }

    public getHeader<T extends readonly (keyof HeaderLayout)[]>(
        ...data: T
    ): { [K in T[number]]: IOValueForKey<K> } {
        const headerData = {} as Record<T[number], IOValueForKey<T[number]>>;
        for (const key of data as readonly T[number][]) {
            headerData[key] = this.callHeaderViewMethod("get", key);
        }
        return headerData;
    }

    /**
     * @param inputs 
     * @returns If there is not enough space in buffer to write, returns 1, otherwise 0 for success
     */
    public writeProcess(inputs: Process): 0 | 1 {
        // TODO: for all body read/write methods, use Atomics
        const { inputSpacer, processSpacerStart, processSpacerEnd } = AudioDataManager.RESERVED_BODY_VALUES;
        const { arr } = this;
        const { processHeadIndex } = this.getHeader("processHeadIndex");
        const sampleFrameLength = inputs[0][0].length;
        
        let writeIndex = Number(processHeadIndex);
        // TODO: implement a check for if another process gets overwritten by
        // checking if the value at the current index is a processSpacerStart.
        const writeBody = (value: number): void => {
            writeIndex = this.loopIndex(writeIndex);
            arr[writeIndex] = Float32.normalizeValue(value);
            writeIndex = this.loopIndex(writeIndex+1);
        }

        writeBody(processSpacerStart);
        writeBody(sampleFrameLength);
        for (let i=0; i<inputs.length; i++) {
            const input = inputs[i];

            for (let j=0; j<input.length; j++) {
                const channel = input[j];

                /* NOTE: an optimization, like the one in the getSamples method, can be made so that
                    1 or 2 subarrays, from the getSubarrays method, and .set() calls can be made to improve copy speed,
                    as opposed to the current iteration done over all channel's samples.
                */
                for (let k=0; k<channel.length; k++) {
                    const sample = channel[k];
                    writeBody(sample);
                }

                // NOTE: adding channel spacers may provide a performance benefit in the future,
                // but will also require a lot of logic rewriting in most of the class methods.
            }
            writeBody(inputSpacer);
        }

        writeBody(processSpacerEnd);
        this.setHeader({ processHeadIndex: writeIndex });
        return 0;
    }

    public clearBody(): void {
        this.arr.fill(0);
        this.setHeader({ processHeadIndex: 0 });
    }

    public readProcess(index: number, searchDirection: -1 | 1 = 1): Process {
        // TODO: for all body read/write methods, use Atomics
        const { processSpacerEnd, inputSpacer } = AudioDataManager["RESERVED_BODY_VALUES"];
        const { arr } = this;
        const inputs: Process = [];

        index = this.loopIndex(this.findNextProcess(index, searchDirection)+searchDirection);
        const sampleFrameLength = arr[index];
        index = this.loopIndex(index+1);
        const curr = new Float32(arr[index]);

        // NOTE: it may be wise to accomodate for processes that have been overwritten in the body
        // since a spacer may end up being found in an unexpected place.

        // Iterate through all inputs
        while(curr.value !== processSpacerEnd) {
            const input: Process[number] = [];
            
            // Iterate through all input channels
            while(curr.value !== inputSpacer) {
                const channel = new Float32Array(sampleFrameLength);

                /* NOTE: use the getSamples method instead to quickly get a copy of the channel's samples */
                // Iterate through all channel samples
                let i = 0;
                for (; i < sampleFrameLength; i++) {
                    const sampleIndex = this.loopIndex(index+i);
                    curr.value = arr[sampleIndex];
                    channel[i] = curr.value;
                }

                index = this.loopIndex(index+i);
                curr.value = arr[index];
                input.push(channel);
            }

            index = this.loopIndex(index+1);
            curr.value = arr[index];
            inputs.push(input);
        }

        return inputs;
    }

    public getSamples(inputIndex: number, channelIndex: number, sampleCount: number, startIndex = this.getHeader("processHeadIndex").processHeadIndex-1, searchDirection: -1 | 1 = -1): Float32Array {
        const paramInfo = `inputIndex: ${inputIndex}, channelIndex: ${channelIndex}, sampleCount: ${sampleCount}`;
        const INP_OOB_ERR = new Error(`Input index out of bounds - ${paramInfo}`);
        const CH_OOB_ERR = new Error(`Channel index out of bounds - ${paramInfo}`);
        const { processSpacerStart, processSpacerEnd, inputSpacer } = AudioDataManager.RESERVED_BODY_VALUES;
        const { arr } = this;
        const samples = new Float32Array(sampleCount);
        let totalSampleCount = 0;

        // NOTE: it may be wise to accomodate for processes that have been overwritten in the body
        // since a spacer may end up being found in an unexpected place.

        // Iterate over the body's processes
        startIndex = this.findNextProcess(startIndex, searchDirection);
        let index = startIndex;
        do {
            const processStartIndex = index;
            index = this.loopIndex(index+1);
            const sampleFrameLength = arr[index];
            index = this.loopIndex(index+1);

            // Find the specified input
            for (let i=0; i<inputIndex; i++) {
                if (Float32.normalizeValue(arr[index]) === processSpacerEnd) {
                    throw INP_OOB_ERR;
                }
                
                while(Float32.normalizeValue(arr[index]) !== inputSpacer) {
                    index = this.loopIndex(index + sampleFrameLength);
                }
                
                index = this.loopIndex(index + 1);
            }
            if (Float32.normalizeValue(arr[index]) === processSpacerEnd) {
                throw INP_OOB_ERR;
            }

            // Find the specified channel
            for (let c=0; c<channelIndex; c++) {
                index = this.loopIndex(index + sampleFrameLength);
                if (Float32.normalizeValue(arr[index]) === inputSpacer) {
                    throw CH_OOB_ERR;
                }
            }

            /**
             * This is meant for preventing too many samples from being set onto samples by removing excess samples from a half, starting from the end of the half
             * @param h 
             * @returns 
             */
            const sliceSubarray = (h: Float32Array) => {
                const neededSamples = sampleCount - totalSampleCount;
                const hLen = Math.min(h.length, neededSamples);
                const start = Math.max(0, h.length - hLen);
                // console.log(`needed: ${neededSamples} - kept samples: ${hLen} - slice range: [${start}, ${h.length})`);
                return h.slice(start, h.length);
            };
            const halves = this.getSubarrays(index, sampleFrameLength);
            let offset: number;

            if (halves.length === 2) {
                const h2 = sliceSubarray(halves[1]!);
                offset = sampleCount - totalSampleCount - h2.length;
                // console.log("samples offset (h2): " + offset);
                totalSampleCount += h2.length;
                samples.set(h2, offset);
            }

            const h1 = sliceSubarray(halves[0]);
            offset = sampleCount - totalSampleCount - h1.length;
            // console.log("samples offset (h1): " + offset);
            totalSampleCount += h1.length;

            samples.set(h1, offset);
            index = this.findNextProcess(processStartIndex+searchDirection, searchDirection);
            
        } while(index !== startIndex && totalSampleCount < sampleCount);

        return samples;
    }

    /**
     * Get 1 or 2 Float32Arrays over the underlying buffer of the body. Modification of the bytes in these Float32Arrays will modify the body, and vice versa
     * @param index 
     * @param itemCount 
     * @returns
     * First item is the primary subarray may extend up to the end of the body.
     * 
     * The second item is the secondary subarray and extends "right" from the start of the body. It is only returned when the number of items from the index exceeds the body length (wrapping to the start).
     */
    private getSubarrays<Half extends Float32Array, H extends [Half, Half?]>(index: number, itemCount: number): H {
        const { arr } = this;
        if (itemCount > arr.length) {
            throw new Error(`Too many items to retrieve: ${itemCount}/${arr.length}`);
        }

        const h1EndI = Math.min(index + itemCount, arr.length);
        const h1 = arr.subarray(index, h1EndI) as Half;
        const halves = [h1] as unknown as H;

        if (h1EndI > arr.length) {
            const h2EndI = h1EndI - arr.length;
            const h2 = arr.subarray(0, h2EndI) as Half;
            halves.push(h2);
        }

        return halves;
    }

    /**
     * Quickly reads a process and outputs its info
     * @param indexValue 
     * @param searchDirection 
     * @returns 
     */
    public getProcessInfo(indexValue: number, searchDirection: -1 | 1 = -1): ProcessInfo {
        indexValue = this.findNextProcess(indexValue, searchDirection);
        const index = new Uint32(indexValue);
        // TODO: use a faster method of reading the body to get the process info
        // instead of relying on the readProcess method
        const process = this.readProcess(index.value);
        const processInfo = this.interpretProcessInfo(process, index.value);

        return processInfo;
    }

    /**
     * Use this method to get the ProcessInfo of an already-read process
     * @param process 
     * @param indexValue If the index of the process is not provided, search for it in the body
     */
    public interpretProcessInfo(process: Process, indexValue?: number): ProcessInfo {
        const totalSampleCount = new Uint64(0);
        const sampleFrameLength = new Float32(process[0][0].length);
        const inputs: ProcessInfo["inputs"] = [];

        for (const processInput of process) {
            const inputInfo = {
                channelCount: new Uint8(processInput.length)
            };
            inputs.push(inputInfo);
            totalSampleCount.value += BigInt(sampleFrameLength.value);
        }

        let index: Uint32;
        if (indexValue !== undefined) {
            index = new Uint32(indexValue);
        } else {
            index = new Uint32(this.searchProcess(process));
        }

        return {
            index,
            totalSampleCount,
            sampleFrameLength,
            inputs
        };
    }

    /**
     * Efficiently finds a process's index in the body based on its data
     * @param process 
     * @returns NaN if the process's index could not be found
     */
    public searchProcess(process: Process): number | typeof NaN {
        const getI = (processStartIndex: number, offset: number) => this.loopIndex(processStartIndex+offset);
        const { processSpacerStart, inputSpacer, processSpacerEnd } = AudioDataManager.RESERVED_BODY_VALUES;
        const { arr } = this;
        const formatted = formatProcess();

        const searchedIndices: Set<number> = new Set();
        let processI: number = this.findNextProcess(0, 1);
        
        while(!isNaN(processI) && !searchedIndices.has(processI)) {
            let pos = 0;
            let matched = true;

            while(arr[getI(processI, pos)] !== processSpacerEnd) {
                if (arr[getI(processI, pos)] !== formatted[pos]) {
                    matched = false;
                    break;
                }
                pos++;
            }

            if (matched) return processI;

            searchedIndices.add(processI);
            processI = this.findNextProcess(processI+pos, 1);
        }
        
        return NaN;

        function formatProcess(): number[] {
            const sampleFrameLength = process[0][0].length;
            const values: number[] = [processSpacerStart, sampleFrameLength];
            for (let i=0; i<process.length; i++) {
                for (let j=0; j<process[i].length; j++) {
                    for (let k=0; k<sampleFrameLength; k++) {
                        values.push(process[i][j][k]);
                    }
                }
                values.push(inputSpacer);
            }
            values.push(processSpacerEnd);
            return values;
        }
    }

    /**
     * Similar to the searchProcess method, but takes an input array of sample values to find a pattern for in the body.
     * 
     * When checking matches, RESERVED_BODY_VALUES automatically skipped. Example:
     * 
     * Input samples: [0.3, 0.6, 0.9]; Body: [(flag), 0.3, 0.6, (flag), 0.9, -0.5]; Valid match ✅
     * @param input Input samples to search for within the body
     * @param matchCount Number of matching patterns to return from the body
     * @returns Starting indices of matching patterns within the body
     */
    public searchSamples(input: Float32Array, matchCount: number = 1): number[] {
        // NOTE: this method iterates backwards from processHeadIndex because it is where the latest samples have been written, and
        // it's more logical to start searching from there, rather than an arbitrary index, like 0. The matches are initially in
        // reverse order (most recently -> least recently written), and later reversed to be chronologically ordered.
        const { arr } = this;
        const matches: number[] = [];
        let index = this.findNextProcess(this.getHeader("processHeadIndex").processHeadIndex, -1);
        const startIndex = index;
        let end = false;
        
        // TODO: fix bug where when matchCount is higher than available matches in body,
        // extra or invalid indices are returned for each extra matchCount value.
        /* Loop for finding multiple matches in body or ensuring no repeated iteration over old indices */
        while(matches.length < matchCount && !end) {

            /* Iterate across the body's samples */
            let matchStartIndex: number | undefined;
            let sampleMatchCount = 0;
            
            for (const bodyIndex of this.sampleIndexIterator(index, -1)) {
                if (matchStartIndex === undefined) matchStartIndex = bodyIndex;
                index = bodyIndex;

                /* Ensure loop hasn't iterated back to starting index */
                if (index === startIndex) {
                    end = true;
                    break;
                }

                /* Compare sample values */
                const bodyVal = Float32.normalizeValue(arr[index]);
                
                // Because the body is being iterated backwards starting from processHeadIndex, the input samples
                // are also checked in reverse order so that they match the order from the body.
                const inputVal = Float32.normalizeValue(input[input.length-sampleMatchCount-1]);

                if (bodyVal === inputVal) {
                    sampleMatchCount++;
                } else {
                    sampleMatchCount = 0;
                }

                /* Check if enough matching sample values have been found */
                if (sampleMatchCount === input.length) {
                    matches.push(matchStartIndex);
                }
            }
        }
        
        return matches.reverse();
    }

    /**
     * Iterates over only audio sample values, and returns their index values. Returns after iterating back to the index parameter
     * @param index Starting iteration index
     * @param direction Direction to iterate through the body (-1 = backward, 1 = forward)
     */
    public *sampleIndexIterator(index: number, direction: -1 | 1) {
        // TODO: fix errors where an index is input where there isn't a process. This will lead to the iterator thinking
        // that there are sample values there because the values should be 0.
        // Handling for partly overwritten processes should also be handled, but this will only show up
        // when enough are written so that the processes wrap around the body.
        const rsbvs = AudioDataManager.RESERVED_BODY_VALUES;
        const rsbvSet = new Set(Object.values(rsbvs).map(Float32.normalizeValue));
        const processSpacerStart = Float32.normalizeValue(rsbvs.processSpacerStart);
        const { arr } = this;
        index = this.loopIndex(index);
        const startI = index;
        let firstIteration = true;

        while(true) {
            const value = Float32.normalizeValue(arr[index]);
            const prev = Float32.normalizeValue(arr[this.loopIndex(index-1)]);

            if (!firstIteration && index === startI) break;

            if (rsbvSet.has(value) || prev === processSpacerStart) {
                index = this.loopIndex(index + direction);
                firstIteration = false;
                continue;
            }

            yield index;

            index = this.loopIndex(index + direction);
            firstIteration = false;
        }
    }

    public getAllProcessIndices(): number[] {
        const indices: number[] = [];

        let next = 0;
        while(
            !isNaN(next = this.findNextProcess(this.loopIndex(next))) &&
            (indices.length < 2 || indices[0] !== indices[indices.length-1])
        ) {
            indices.push(next);
            next++;
        }

        indices.shift();
        indices.sort((a, b) => a - b);
        return indices;
    }

    /**
     * Find the next process index in the body. If initial index is on processSpacerStart, return that index
     * @param index 
     * @returns Index of next process in body
     */
    public findNextProcess(index: number, searchDirection: -1 | 1 = 1): number {
        const { processSpacerStart } = AudioDataManager["RESERVED_BODY_VALUES"];
        const { arr } = this;

        const isProcessStartOffset = (): boolean => {
            const i = this.loopIndex(index);
            const curr = Float32.normalizeValue(arr[i]);
            return curr === processSpacerStart;
        }

        // TODO: need to handle when there are no processes
        while(!isProcessStartOffset()) {
            // NOTE: may want to optimize this by reducing the amount of iterations by calculating
            // the sample frame length from the amount of items in each channel
            index = this.loopIndex(index + searchDirection);
        }

        return index;
    }

    /**
     * If the end of the body array is exceeded, index loops back to beginning of body. Otherwise returns inputted index. Negative indices wrap back to the end of the body.
     * @param index 
     * @returns 
     */
    private loopIndex(index: number): number {
        const arrLength = this.arr.length;
        return ((index % arrLength) + arrLength) % arrLength;
    }

    /**
     * Returns the number format name of a DataView method, AFTER "set" or "get" (e.g., "BigUint64")
     */
    private static getViewMethodName(Wrapper: NumberWrapperTypes): string {
        let methodName = "";

        if (Wrapper.FLOAT) {
            methodName += "Float";
        } else {
            if (Wrapper.BYTES * 8 >= 64) {
                methodName += "Big";
            }

            let bigSuffix = ""; // Letters after "Big"
            if (Wrapper.MIN === 0) {
                bigSuffix += "u";
            }
            bigSuffix += "int";
            methodName += bigSuffix.substring(0, 1).toUpperCase() + bigSuffix.substring(1, bigSuffix.length);
        }

        methodName += `${Wrapper.BYTES * 8}`;
        return methodName;
    }

    private callHeaderViewMethod<
        K extends keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]
    >(
        action: "get",
        key: K
    ): IOValueForKey<K>;

    private callHeaderViewMethod<
        K extends keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]
    >(
        action: "set",
        key: K,
        value: IOValueForKey<K>
    ): undefined;

    private callHeaderViewMethod<
        K extends keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]
    >(
        action: "set" | "get",
        key: K,
        value?: IOValueForKey<K>
    ): IOValueForKey<K> | undefined {
        type DataViewSetter = (byteOffset: number, value: IOValueForKey<K>, littleEndian: true) => undefined;
        type DataViewGetter = (byteOffset: number, littleEndian: true) => IOValueForKey<K>;

        const { byteOffset, Wrapper } = AudioDataManager.HEADER_LAYOUT[key];
        const wrapped = new Wrapper(0);
        const methodName = `${action}${AudioDataManager.getViewMethodName(AudioDataManager.HEADER_LAYOUT[key].Wrapper)}` as keyof typeof this.view;
        let method = (this.view[methodName] as Function).bind(this.view) as DataViewSetter | DataViewGetter;

        const methodNameStr = String(methodName);
        if (methodNameStr.startsWith("set") && value !== undefined) {
            method = method as DataViewSetter;
            wrapped.value = value;

            if (Wrapper.BYTES < 8) {
                return method(byteOffset, Number(wrapped.value) as IOValueForKey<K>, true);
            } else {
                return method(byteOffset, wrapped.value as IOValueForKey<K>, true);
            }
        } else if (methodNameStr.startsWith("get") && value === undefined) {
            method = method as DataViewGetter;
            if (Wrapper.BYTES < 8) {
                return Number(method(byteOffset, true)) as IOValueForKey<K>;
            } else {
                return method(byteOffset, true);
            }
        } else {
            throw new Error("Invalid view method params");
        }
    }
}