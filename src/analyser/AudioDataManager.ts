import { NumberWrapperTypes, Int8, Int16, Int32, Int64, Uint8, Uint16, Uint32, Uint64, Float16, Float32, Float64 } from "../utils/numberWrappers";

type HeaderLayoutMember = {
    byteOffset: number;
    Wrapper: NumberWrapperTypes;
};
type HeaderLayout = Readonly<
    Record<keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"], HeaderLayoutMember>
>;

type BigIntNumberWrappers = typeof Int64 | typeof Uint64;
type NonBigIntNumberWrappers = Exclude<NumberWrapperTypes, BigIntNumberWrappers>;
type IOValueForKey<K extends keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]> =
    IOValueFor<typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"][K]> 
;
type IOValueFor<
    Wrapper extends typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"][keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]]
> = Wrapper extends BigIntNumberWrappers
    ? bigint
    : Wrapper extends NonBigIntNumberWrappers
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
            byteOffset += new Wrapper(0 as never).bytes;
        }

        AudioDataManager.HEADER_LAYOUT = Object.freeze(obj);
    }
    public static readonly HEADER_SIZE: number = Object.values(AudioDataManager.HEADER_LAYOUT).reduce((prev, curr, i, arr) => {
        let value = curr.byteOffset;
        if (i === arr.length-1) {
            value += new curr.Wrapper(0 as never).bytes;
        }
        return prev + value;
    }, 0);

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
        const resbvs = AudioDataManager.RESERVED_BODY_VALUES;
        const headerSize = AudioDataManager.HEADER_SIZE + resbvs.headerLayoutEnd.bytes;

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
        const bodyOffset = headerLayoutEnd.bytes + AudioDataManager.HEADER_SIZE;
        this.setHeader({
            headProcessOffset: BigInt(bodyOffset),
            sampleRate,
            currentTime: 0.0,
            currentFrame: 0n,
            previousConsumeFrame: 0n,
            fftRatio
        });

        this.view.setFloat32(
            AudioDataManager.HEADER_SIZE,
            headerLayoutEnd.value,
            true
        );
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
        const FLOAT_SIZE = new Float32(0).bytes;
        const startOffset = this.getHeader("headProcessOffset").headProcessOffset;
        const sampleFrameLength = new Uint16(inputs[0][0].length);
        let offset = this.getViewOffset(Number(startOffset));

        view.setUint16(Number(offset), Number(sampleFrameLength.value), true);
        offset = this.getViewOffset(offset + FLOAT_SIZE);

        const writeFloat32 = (value: number) => {
            // If offset not divisible by float size (4), fill with blanks until it is.
            // This helps with offset overflows in the circular body, where
            // trying to write a float when there are only 2 bytes left before end of buffer would cause an error.
            const { blankFlag } = AudioDataManager["RESERVED_BODY_VALUES"];
            const blankCount = (view.byteLength - (offset+1)) % 4;
            for (let i=0; i<blankCount; i++) {
                view.setFloat32(offset, blankFlag.value, true);
                offset = this.getViewOffset(offset + blankFlag.bytes);
            }

            view.setFloat32(offset, value, true);
            offset = this.getViewOffset(offset + FLOAT_SIZE);
        }

        for (const input of inputs) {
            for (const channel of input) {
                for (const sample of channel) {
                    writeFloat32(sample);
                }
            }
            writeFloat32(inputSpacer.value);
        }

        writeFloat32(processSpacer.value);
        this.setHeader({ headProcessOffset: BigInt(offset) });
        return 0;
    }

    public readProcess(byteOffset: number): Float32Array[][] {
        const { headerLayoutEnd, processSpacer, inputSpacer, blankFlag } = AudioDataManager["RESERVED_BODY_VALUES"];
        const { view } = this;
        const SHORT_SIZE = new Uint16(0).bytes;
        const FLOAT_SIZE = new Float32(0).bytes;
        const inputs: Float32Array[][] = [];
        console.log("Beginning read...");
        byteOffset = this.findNextProcess(byteOffset);
        console.log("next process offset:", byteOffset);
        return inputs;

        const sampleFrameLength = view.getUint16(byteOffset, true);
        byteOffset = this.getViewOffset(byteOffset + SHORT_SIZE);
        const viewOffsetFloat = new Float32(view.getFloat32(byteOffset, true));

        while(viewOffsetFloat.value !== processSpacer.value) {
            const input: Float32Array[] = [];
            
            while(viewOffsetFloat.value !== inputSpacer.value) {
                const channel = new Float32Array(sampleFrameLength);

                let i = 0;
                while(i < sampleFrameLength) {
                    const value = view.getFloat32(byteOffset, true);
                    if (new Float32(value).value !== blankFlag.value) {
                        channel[i] = value;
                        i++;
                    }
                    byteOffset = this.getViewOffset(byteOffset + FLOAT_SIZE);
                }

                input.push(channel);
            }

            inputs.push(input);
        }

        return inputs;
    }

    public getProcessInfo(byteOffset: number): ProcessInfo {
        byteOffset = this.findNextProcess(byteOffset);
    }

    /**
     * If there is not a process at byteOffset, find the next process after the offset in the buffer
     * @param byteOffset 
     * @returns Byte offset of next process in buffer
     */
    public findNextProcess(byteOffset: number): number {
        const { headerLayoutEnd, processSpacer } = AudioDataManager["RESERVED_BODY_VALUES"];
        const FLOAT_SIZE = new Float32(0).bytes;

        const isProcessStartOffset = (offset: number): boolean => {
            offset = this.getViewOffset(offset - FLOAT_SIZE);
            const prevValue = new Float32(this.view.getFloat32(offset, true));
            return prevValue.value === processSpacer.value || prevValue.value === headerLayoutEnd.value;
        }
        
        const errorValues: string[] = [];
        while(!isProcessStartOffset(byteOffset)) {
            if (errorValues.length >= 1_000_000) {
                const shortened = errorValues.slice(0, 15);
                throw new Error(
                    `Too much iteration\n`+
                    `Process spacer & Header layout end: ${processSpacer.value} ${new Float32(55).value} | ${headerLayoutEnd.value}\n`+
                    `${JSON.stringify(shortened, null, 4)}`
                );
            }
            errorValues.push(`Byte offset: ${byteOffset}`);
            byteOffset = this.getViewOffset(byteOffset + FLOAT_SIZE);
        }

        return byteOffset;
    }

    /**
     * Treats byteOffset like an index, and the body is like a circular buffer. If last byte is exceeded, offset goes back to body offset
     * @param byteOffset 
     * @returns 
     */
    private getViewOffset(byteOffset: number): number {
        const { headerLayoutEnd } = AudioDataManager["RESERVED_BODY_VALUES"];
        const bodyOffset = AudioDataManager["HEADER_SIZE"] + headerLayoutEnd.bytes;
        const viewSize = this.view.byteLength;
        const bodySize = viewSize - bodyOffset;
        byteOffset -= bodyOffset;
        return (byteOffset % bodySize) + bodyOffset;
    }

    /**
     * Returns the number format name of a DataView method, AFTER "set" or "get" (e.g., "BigUint64")
     */
    private static getViewMethodName({ Wrapper }: HeaderLayoutMember): string {
        const wrappedValue = new Wrapper(0 as never);
        let methodName = "";

        if (wrappedValue.float) {
            methodName += "Float";
        } else {
            if (wrappedValue.bytes * 8 >= 64) {
                methodName += "Big";
            }

            let bigSuffix = ""; // Letters after "Big"
            if (!wrappedValue.signed) {
                bigSuffix += "u";
            }
            bigSuffix += "int";
            methodName += bigSuffix.substring(0, 1).toUpperCase() + bigSuffix.substring(1, bigSuffix.length);
        }

        methodName += `${wrappedValue.bytes * 8}`;
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
        const wrapped = new Wrapper(0 as never);
        const methodName = `${action}${AudioDataManager.getViewMethodName(AudioDataManager.HEADER_LAYOUT[key])}` as keyof typeof this.view;
        let method = (this.view[methodName] as DataViewSetter | DataViewGetter).bind(this.view);

        const methodNameStr = String(methodName);
        if (methodNameStr.startsWith("set") && value !== undefined) {
            method = method as DataViewSetter;
            wrapped.value = value;

            if (wrapped.bytes < 8) {
                return method(byteOffset, Number(wrapped.value) as IOValueForKey<K>, true);
            } else {
                return method(byteOffset, wrapped.value as IOValueForKey<K>, true);
            }
        } else if (methodNameStr.startsWith("get") && value === undefined) {
            method = method as DataViewGetter;
            if (wrapped.bytes < 8) {
                return Number(method(byteOffset, true)) as IOValueForKey<K>;
            } else {
                return method(byteOffset, true);
            }
        } else {
            throw new Error("Invalid view method params");
        }
    }
}