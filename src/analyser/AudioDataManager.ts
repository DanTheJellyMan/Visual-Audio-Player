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

type ProcessInfo = {
    byteOffset: Uint64,
    sampleFrameLength: Uint16,
    inputChannelCounts: Uint8[]
};

// NOTE: In the future, the sample-frame sizes of data blocks may change over time, according to MDN

/**
 * Handles reads and writes to a buffer containing raw audio data.
 * 
 * The HeaderLayout is a predefined structure of data, and such data may be modified at runtime.
 * 
 * The body comes after HeaderLayout, where process blocks contain all audio data (samples of channels per input) preceeded by the sample count.
 * 
 * The body is treated as a circular buffer. The consumer (another thing that will read the audio data) should continuously read new process data blocks until it has enough samples. Missing reading some process blocks is fine.
 * 
 * Total buffer size is arbitrarily set, but should be large enough for around 1x the sample rate, so that there won't be overwrites of data the consumer is reading.
 * 
 * Buffer layout:
 * 
 * | HeaderLayout (header-layout-end spacer) --PROCESS BLOCK-- (spacer) ... (spacer) |
 * 
 * Process block layout:
 * 
 * | Uint16 sample-frame length | --Input-- (spacer) ... (spacer) |
 */
export default class AudioDataManager {
    public static readonly HEADER_LAYOUT_WRAPPERS = Object.freeze({
        /** Absolute byteOffset within the buffer */
        headProcessOffset: Uint64,
        /** Used to determine the size of the body */
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

    public static HEADER_LAYOUT: Readonly<HeaderLayout>;
    static {
        const wrappers = AudioDataManager.HEADER_LAYOUT_WRAPPERS;
        const obj = {} as Record<keyof typeof wrappers, HeaderLayoutMember>;
        let byteOffset = 0;

        const entries = Object.entries(wrappers) as [keyof typeof wrappers, typeof wrappers[keyof typeof wrappers]][];
        for (let i=0; i<entries.length; i++) {
            const name = entries[i][0] as keyof typeof wrappers;
            const Wrapper = entries[i][1];
            obj[name] = { byteOffset, Wrapper };
            byteOffset += Wrapper.BYTES;
        }

        AudioDataManager.HEADER_LAYOUT = Object.freeze(obj);
    }
    public static readonly HEADER_SIZE: number = Object.values(AudioDataManager.HEADER_LAYOUT).reduce((prev, curr, i, arr) => {
        let value = curr.byteOffset;
        if (i === arr.length-1) {
            value += curr.Wrapper.BYTES;
        }
        return prev + value;
    }, 0);

    // TODO: make this assume values are Float32, since the body will soon be converted to Float32Array
    // TODO: make a process spacer for the start and end, respectively
    /** Numbers must be OUTSIDE OF [-1.0, 1.0] */
    public static readonly RESERVED_BODY_VALUES = Object.freeze({
        headerLayoutEnd: new Float32(2.0),
        inputSpacer: new Float32(3.0),
        processSpacer: new Float32(4.0),
        blankFlag: new Float32(5.0)
    });

    private view: DataView;

    constructor(buf: ArrayBufferLike) {
        this.view = new DataView(buf);
    }

    /**
     * Estimate a good size for the buffer in bytes
     * @param sampleRate Samples processed per second
     * @param inputCount
     * @param maxChannelCount Based on audio format (mono, stereo, surround)
     */
    public static estimateBufSize(sampleRate: number = 48000, inputCount: number = 2, maxChannelCount: number = 2): number {
        // TODO: make this accomodate the header size, and the body size (Float32Array)
        // cleanly; the body size must be divisible by 4 (bytes)
        const resbvs = AudioDataManager.RESERVED_BODY_VALUES;
        const headerSize = AudioDataManager.HEADER_SIZE + (resbvs.headerLayoutEnd.constructor as typeof Float32).BYTES;

        const fftSize = 2 ** Number(AudioDataManager["FFT_RATIO_MAX"].value);
        const minBodySizeTarget = Math.max(fftSize, sampleRate);

        const sampleFrameLength = 512;
        const maxProcessSampleCount = inputCount * maxChannelCount * sampleFrameLength;

        return (headerSize + minBodySizeTarget + (maxProcessSampleCount * 10)) * 5;
    }

    /**
     * Convenience method for setting all necessary values for the header and the header spacer
     */
    public initHeader(sampleRate: number, fftRatio: number): void {
        const { headerLayoutEnd } = AudioDataManager.RESERVED_BODY_VALUES;
        const bodyOffset = (headerLayoutEnd.constructor as typeof Float32).BYTES + AudioDataManager.HEADER_SIZE;
        this.setHeader({
            headProcessOffset: BigInt(bodyOffset),
            sampleRate,
            currentTime: 0.0,
            currentFrame: 0n,
            previousConsumeFrame: 0n,
            fftRatio
        });

        this.writeViewNumber(Float32, AudioDataManager.HEADER_SIZE, headerLayoutEnd.value);
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
     * 
     * @param inputs 
     * @returns If there is not enough space in buffer to write, returns 1, otherwise 0 for success.
     */
    public writeProcess(inputs: Float32Array[][]): 0 | 1 {
        const { view } = this;
        const { inputSpacer, processSpacer } = AudioDataManager.RESERVED_BODY_VALUES;
        const FLOAT_SIZE = Float32.BYTES;
        const SHORT_SIZE = Uint16.BYTES;
        const startOffset = this.getHeader("headProcessOffset").headProcessOffset;
        const sampleFrameLength = new Uint16(inputs[0][0].length);
        let offset = this.getViewOffset(Number(startOffset));

        this.writeViewNumber(Float32, offset - FLOAT_SIZE, processSpacer.value);
        this.writeViewNumber(Uint16, offset, Number(sampleFrameLength.value));
        offset = this.getViewValueOffset(FLOAT_SIZE, offset + SHORT_SIZE);

        for (const input of inputs) {
            for (const channel of input) {
                for (const sample of channel) {
                    this.writeViewNumber(Float32, offset, sample);
                    offset = this.getViewValueOffset(FLOAT_SIZE, offset + FLOAT_SIZE);
                }
            }
            this.writeViewNumber(Float32, offset, inputSpacer.value);
            offset = this.getViewValueOffset(FLOAT_SIZE, offset + FLOAT_SIZE);
        }

        this.writeViewNumber(Float32, offset, processSpacer.value);
        offset = this.getViewValueOffset(SHORT_SIZE, offset + FLOAT_SIZE);
        this.setHeader({ headProcessOffset: BigInt(offset) });
        return 0;
    }

    public readProcess(byteOffset: number, searchDirection: -1 | 1 = -1): Float32Array[][] {
        const { processSpacer, inputSpacer, blankFlag } = AudioDataManager["RESERVED_BODY_VALUES"];
        const resValues = Object.values(AudioDataManager.RESERVED_BODY_VALUES).map((wrapped) => wrapped.value);
        const { view } = this;
        const SHORT_SIZE = Uint16.BYTES;
        const FLOAT_SIZE = Float32.BYTES;
        const inputs: Float32Array[][] = [];
        byteOffset = this.findNextProcess(byteOffset, searchDirection);
        byteOffset = this.getViewValueOffset(SHORT_SIZE, byteOffset);
        console.log(`actual read starting offset: ${byteOffset}`);

        const sampleFrameLength = this.readViewNumber(Uint16, byteOffset);
        console.log("sample frame length: " + sampleFrameLength);
        console.log("frame length? " + this.view.getUint16(byteOffset, true));
        byteOffset = this.getViewValueOffset(FLOAT_SIZE,
            this.getViewOffset(byteOffset + SHORT_SIZE)
        );
        const viewOffsetFloat = new Float32(this.readViewNumber(Float32, byteOffset));

        let iterations = 0; // For testing
        // Iterate through all inputs
        while(viewOffsetFloat.value !== processSpacer.value) {
            const input: Float32Array[] = [];
            
            // Iterate through all input channels
            while(viewOffsetFloat.value !== inputSpacer.value) {
                const channel = new Float32Array(sampleFrameLength);
                console.log("sample frame length: " + sampleFrameLength);
                throw new Error("u gae");

                // Iterate through all channel samples
                let i = 0;
                // const msgs: string[] = [];
                // const offsets: string[] = [];
                while(i < sampleFrameLength) {
                    // offsets.push(`${byteOffset} / ${view.byteLength}`);
                    if (byteOffset + FLOAT_SIZE < view.byteLength) {
                        // msgs.push("giggity");
                        viewOffsetFloat.value = this.readViewNumber(Float32, byteOffset);

                        if (!resValues.includes(viewOffsetFloat.value)) {
                            channel[i] = viewOffsetFloat.value;
                            i++;
                            console.log("bollocks");
                        }
                    } else {
                        // msgs.push("goo");
                    }

                    byteOffset = this.getViewOffset(byteOffset + FLOAT_SIZE);

                    if (iterations++ >= 1_000) {
                        // console.error(`Header size: ${AudioDataManager["HEADER_SIZE"]}`);
                        // console.error(JSON.stringify(offsets.slice(0, 20), null, 4));
                        // console.error("Goos: "+
                        //     JSON.stringify(msgs.filter((str) => str === "goo"), null, 4)
                        // );
                        throw new Error("Too much iteration");
                    }
                }

                viewOffsetFloat.value = this.readViewNumber(Float32, byteOffset);
                input.push(channel);
            }

            viewOffsetFloat.value = this.readViewNumber(Float32, byteOffset);
            inputs.push(input);
        }

        return inputs;
    }

    public getProcessInfo(byteOffset: number): ProcessInfo {
        byteOffset = this.findNextProcess(byteOffset);
    }

    public getAllProcessOffsets(): Array<number> {
        const offsets: Array<number> = [];
        let nextOffset = 0;

        while (offsets.length <= 1 || (offsets.length > 1 && offsets[0] !== offsets[offsets.length-1])) {
            nextOffset = this.findNextProcess(nextOffset, 1);
            offsets.push(nextOffset);
            nextOffset++;
        }

        if (offsets.length > 1) offsets.shift();
        offsets.sort((a, b) => a - b);
        return offsets;
    }

    /**
     * Find the next process offset in the buffer. If initial byteOffset is on sample frame size (process block start), return that offset
     * @param byteOffset 
     * @param searchDirection -1 = backwards | 1 = forwards
     * @returns Byte offset of next process in buffer
     */
    public findNextProcess(byteOffset: number, searchDirection: -1 | 1 = -1): number {
        const { processSpacer } = AudioDataManager["RESERVED_BODY_VALUES"];
        const FLOAT_SIZE = Float32.BYTES;
        const SHORT_SIZE = Int16.BYTES;

        // Process block start visualization:
        // ... | 4 | 4 (spacer) | 2 (sample frame length) | 4 | ...

        const isProcessStartOffset = (offset: number): boolean => {
            const spacerOffset = this.getViewValueOffset(FLOAT_SIZE, offset - FLOAT_SIZE);
            const value = new Float32(this.readViewNumber(Float32, spacerOffset));
            return value.value === processSpacer.value;
        }
        
        const errorValues: string[] = [];
        // TODO: need to handle when there are no processes
        while(!isProcessStartOffset(byteOffset)) {
            if (errorValues.length >= 50_000_000) {
                const shortened = errorValues.slice(errorValues.length-15);
                throw new Error(
                    `Too much iteration (View byteLength: ${this.view.byteLength})\n`+
                    `${JSON.stringify(shortened, null, 4)}`
                );
            }
            errorValues.push(`Byte offset: ${byteOffset}`);
            
            // TODO: need to handle initial offsets that do not cleanly accomodate Shorts and Floats
            // without just using value 1 for increment/decrement (performance concerns).
            // This is because even if you use 2 for increment, offset wrapping in the body may lead to
            // an awkward offset being reached, so currently value 1 solves this issue.
            // 
            // An idea is to make the total body size divisible by 2 or 4, but this still leads to 2 checks (instead of 4)
            // occuring for every 4 byte value, which is still inefficient.
            // 
            // Another idea is to have ALL values in body be Float32, but this may undermine the
            // purpose of even using DataView if only header will be utilizing different number sizes,
            // making a TypedArray for body and a different data structure for the header more appealing.
            // 
            // Testing needed to verify if a new solution is warranted, but this is likely what should happen.
            // The fact that blankFlags are being used is disregarding the whole point of using different number types: to save buffer space.
            byteOffset = this.getViewOffset(byteOffset + (1 * searchDirection));
        }

        return byteOffset;
    }

    private writeViewNumber<
        T extends NumberWrapperTypes
    >(type: T, byteOffset: number, value: WrapperValue<T>): void {
        type ViewSetter = (byteOffset: number, value: WrapperValue<T>, littleEndian: boolean) => void;
        const { view } = this;
        const name = `set${AudioDataManager.getViewMethodName(type)}` as keyof typeof view;
        const method = (view[name] as ViewSetter).bind(view);

        byteOffset = this.getViewValueOffset(type.BYTES, byteOffset);
        method(byteOffset, value, true);
    }

    private readViewNumber<
        T extends NumberWrapperTypes
    >(type: T, byteOffset: number): WrapperValue<T> {
        type ViewGetter = (byteOffset: number, littleEndian: boolean) => WrapperValue<T>;
        const { view } = this;
        const name = `get${AudioDataManager.getViewMethodName(type)}` as keyof typeof view;
        const method = (view[name] as ViewGetter).bind(view);
        
        byteOffset = this.getViewValueOffset(type.BYTES, byteOffset);
        const value = method(byteOffset, true);

        return value;
    }

    /**
     * 
     * @param size Expected byte size of the value at the given byte offset
     * @param byteOffset 
     * @returns 
     */
    private getViewValueOffset(size: number, byteOffset: number): number {
        const { view } = this;
        byteOffset = this.getViewOffset(byteOffset);
        const blankCount = byteOffset + size >= view.byteLength
            ? (view.byteLength - byteOffset) % size
            : 0;
        byteOffset = this.getViewOffset(blankCount + byteOffset);
        return byteOffset;
    }

    /**
     * Treats byteOffset like an index, and the body is like a circular buffer. If last byte is exceeded, offset goes back to body offset
     * @param byteOffset 
     * @returns 
     */
    private getViewOffset(byteOffset: number): number {
        const { headerLayoutEnd } = AudioDataManager["RESERVED_BODY_VALUES"];
        const bodyOffset = AudioDataManager["HEADER_SIZE"] + (headerLayoutEnd.constructor as typeof Float32).BYTES;
        const viewSize = this.view.byteLength;
        const bodySize = viewSize - bodyOffset;
        byteOffset -= bodyOffset;

        // Negative byte offsets wrap back to the end of the buffer. Positives remain at their value
        const wrapped = ((byteOffset % bodySize) + bodySize) % bodySize;
        return wrapped + bodyOffset;
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
        let method = (this.view[methodName] as DataViewSetter | DataViewGetter).bind(this.view);

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