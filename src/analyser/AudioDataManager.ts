import { NumberWrapperTypes, Int64, Uint8, Uint16, Uint64, Float32, Float64 } from "../utils/numberWrappers";

type HeaderLayoutMember = {
    byteOffset: number;
    Wrapper: NumberWrapperTypes;
};
type HeaderLayout = Readonly<Record<keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"], HeaderLayoutMember>>;

type IOValueFor<K extends keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]> =
    typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"][K] extends typeof Int64 | typeof Uint64
        ? bigint
        : number
;

// I'm sorry for the unholy abomination of types being used. I had to please the typescript compiler
type HeaderLayoutData = {
    [K in keyof HeaderLayout]: IOValueFor<K>
}
/** Used for iteration (like with Object.entries()) */
type HeaderLayoutEntry = {
    [K in keyof HeaderLayout]: [K, IOValueFor<K>]
}[keyof HeaderLayout];

// NOTE: In the future, the sample-frame sizes of data blocks may change over time, according to MDN

/**
 * Handles reads and writes to a buffer containing raw audio data.
 * 
 * The HeaderLayout is a predefined structure of data, and such data may be modified at runtime.
 * 
 * The body comes after HeaderLayout, where process blocks contain all audio data (samples of channels per input) preceeded by the sample count.
 * 
 * The body is treated as a circular buffer. The consumer (another thing that will read the audio data) should wait until enough samples have been stored for FFT before reading data, staring at tailProcessOffset
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
        /** Absolute byteOffset within the buffer */
        tailProcessOffset: Uint64,
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
        /** fftSize: 2^n. n[5, 15] */
        fftRatio: Uint8
    });

    public static HEADER_LAYOUT: Readonly<HeaderLayout>;
    static {
        const wrappers = AudioDataManager.HEADER_LAYOUT_WRAPPERS;
        const obj = {} as Record<keyof typeof wrappers, HeaderLayoutMember>;
        let byteOffset = 0;

        const entries = Object.entries(wrappers);
        for (let i=0; i<entries.length; i++) {
            const name = entries[i][0] as keyof typeof wrappers;
            const Wrapper = entries[i][1] as NumberWrapperTypes;
            obj[name] = { byteOffset, Wrapper };
            byteOffset += new Wrapper(0).bytes;
        }

        AudioDataManager.HEADER_LAYOUT = Object.freeze(obj);
    }
    public static readonly HEADER_SIZE: number = Object.values(AudioDataManager.HEADER_LAYOUT).reduce((prev, curr, i, arr) => {
        let value = curr.byteOffset;
        if (i === arr.length-1) {
            value += new curr.Wrapper(0).bytes;
        }
        return prev + value;
    }, 0);

    /** Numbers must be OUTSIDE OF [-1.0, 1.0] */
    private static readonly RESERVED_BODY_VALUES = Object.freeze({
        headerLayoutEnd: new Float32(2.0),
        inputSpacer: new Float32(3.0),
        processSpacer: new Float32(4.0),
        jumpToFlag: new Float32(5.0)
    });

    private view: DataView;

    constructor(buf: ArrayBufferLike) {
        this.view = new DataView(buf);
    }

    /**
     * Estimate a good max size for the buffer
     * @param fftRatio [5, 15]
     * @param sampleRate Samples processed per second
     */
    public static estimateMaxBufSize(sampleRate: number = 48000, fftRatio: number = 15): number {
        const resbvs = AudioDataManager.RESERVED_BODY_VALUES;
        const headerSize = AudioDataManager.HEADER_SIZE + resbvs.headerLayoutEnd.bytes;

        const fftSize = 2 ** fftRatio;
        const minBodySizeTarget = Math.max(fftSize, sampleRate);

        return (headerSize + (minBodySizeTarget * 10)) * 1.5;
    }

    /**
     * Convenience method for setting all necessary values for the header and the spacer
     */
    public initHeader(sampleRate: number, fftRatio: bigint): void {
        const { headerLayoutEnd } = AudioDataManager.RESERVED_BODY_VALUES;
        const bodyOffset = headerLayoutEnd.bytes + AudioDataManager.HEADER_SIZE;
        const data = ({
            headProcessOffset: bodyOffset,
            tailProcessOffset: bodyOffset,
            sampleRate,
            currentTime: 0.0,
            currentFrame: 0n,
            previousConsumeFrame: 0n,
            fftRatio
        } as unknown) as HeaderLayoutData;
        this.setHeader(data);

        this.view.setFloat32(
            AudioDataManager.HEADER_SIZE,
            headerLayoutEnd.value,
            true
        );
    }

    public setHeader(data: HeaderLayoutData): void {
        for (const entry of Object.entries(data) as HeaderLayoutEntry[]) {
            this.callHeaderViewMethod("set", entry[0] as keyof HeaderLayout, entry[1] as IOValueFor<typeof entry[0]>);
        }
    }

    public getHeader<T extends readonly (keyof HeaderLayout)[]>(
        ...data: T
    ): Record<T[number], number | bigint> {
        const headerData = {} as Record<T[number], number | bigint>;
        for (const key of data as readonly T[number][]) {
            headerData[key] = this.callHeaderViewMethod("get", key) as number | bigint;
        }
        return headerData;
    }

    public writeProcess(inputs: Float32Array[][]): void {
        const { view } = this;
        const startOffset = this.getHeader("headProcessOffset").headProcessOffset as bigint;
        const sampleFrameLength = new Uint16(inputs[0][0].length);
        
        let totalProcessSize = 0n;
        for (const input of inputs) {
            const channels = BigInt(input.length);
            totalProcessSize += sampleFrameLength.value * channels;
        }

        // TODO: handle writes at the end of the buffer, and
        // writes when there is not enough space for headProcessOffset to be
        // less than tailProcessOffset BEFORE beginning writes.

        // TODO: finish writing this loop
        let offset = startOffset;
        for (const input of inputs) {
            for (const channel of input) {
                for (const sample of channel) {
                    view.setFloat32(Number(offset), sample, true);
                }
            }
        }
    }

    public readProcess() {
        // TODO: handle reads at the end of the buffer
    }

    /**
     * Returns the number format name of a DataView method, AFTER "set" or "get" (e.g., "BigUint64")
     */
    private static getViewMethodName({ Wrapper }: HeaderLayoutMember): string {
        const wrappedValue = new Wrapper(0);
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
    ): IOValueFor<K>;

    private callHeaderViewMethod<
        K extends keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]
    >(
        action: "set",
        key: K,
        value: IOValueFor<K>
    ): undefined;

    private callHeaderViewMethod<
        K extends keyof typeof AudioDataManager["HEADER_LAYOUT_WRAPPERS"]
    >(
        action: "set" | "get",
        key: K,
        value?: IOValueFor<K>
    ): IOValueFor<K> | undefined {
        type DataViewSetter = (byteOffset: number, value: IOValueFor<K>, littleEndian: true) => undefined;
        type DataViewGetter = (byteOffset: number, littleEndian: true) => IOValueFor<K>;

        const { byteOffset, Wrapper } = AudioDataManager.HEADER_LAYOUT[key];
        const wrapped = new Wrapper(0);
        const methodName = `${action}${AudioDataManager.getViewMethodName(AudioDataManager.HEADER_LAYOUT[key])}` as keyof typeof this.view;
        let method = (this.view[methodName] as DataViewSetter | DataViewGetter).bind(this.view);

        // console.log(methodName, `{ ${key}: ${value} } -> ${byteOffset} bytes`);

        const methodNameStr = String(methodName);
        if (methodNameStr.startsWith("set") && value !== undefined) {
            method = method as DataViewSetter;
            wrapped.value = value;

            if (wrapped.bytes < 8) {
                return method(byteOffset, Number(wrapped.value) as IOValueFor<K>, true);
            } else {
                return method(byteOffset, wrapped.value as IOValueFor<K>, true);
            }
        } else if (methodNameStr.startsWith("get") && value === undefined) {
            method = method as DataViewGetter;
            if (wrapped.bytes < 8) {
                return Number(method(byteOffset, true)) as IOValueFor<K>;
            } else {
                return method(byteOffset, true);
            }
        } else {
            throw new Error("Invalid view method params");
        }

        // if (String(methodName).startsWith("set") && value !== undefined) {
        //     // Either value type float or NOT Bigint
        //     if (wrappedValue.float || wrappedValue.bytes < 8) {
        //         if (wrappedValue.float) {
        //             const normalized = wrappedValue.normalizeValue(value as number);
        //             console.log("normalized float:" + normalized);
        //             const returnVal = method(
        //                 byteOffset,
        //                 normalized,
        //                 true
        //             ) as number;
        //             console.log("Float value: " + this.view.getFloat32(byteOffset, true));
        //             return returnVal;
        //         } else {
        //             return Number(method(
        //                 byteOffset,
        //                 Number(wrappedValue.normalizeValue(value)),
        //                 true
        //             ) as bigint);
        //         }
        //     } else {
        //         return method(
        //             byteOffset,
        //             wrappedValue.normalizeValue(value),
        //             true
        //         ) as bigint;
        //     }
        // } else if () {
        //     return (method as Function)(byteOffset, true) as number | bigint;
        // }
    }
}