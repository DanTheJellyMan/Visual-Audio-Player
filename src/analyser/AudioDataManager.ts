import { NumberWrapperTypes, Uint8, Uint64, Float16, Float64 } from "../utils/numberWrappers";

const headerLayoutWrappers = Object.freeze({
    writeIndex: Uint64,
    readIndex: Uint64,
    inputCount: Uint8,
    channelCount: Uint8,
    /** fftSize: 2^n. n[5, 15] */
    fftRatio: Uint8,
    currentTime: Float64,
    sampleRate: Float16
});
type HeaderLayoutMember = {
    byteOffset: number;
    Wrapper: NumberWrapperTypes;
};
type HeaderLayout = Readonly<Record<keyof typeof headerLayoutWrappers, HeaderLayoutMember>>;

function createHeaderLayout(wrappers: typeof headerLayoutWrappers): HeaderLayout {
    const obj = {} as Record<keyof typeof wrappers, HeaderLayoutMember>;
    let byteOffset = 0;

    const entries = Object.entries(wrappers);
    for (let i=0; i<entries.length; i++) {
        const name = entries[i][0] as keyof typeof wrappers;
        const Wrapper = entries[i][1] as NumberWrapperTypes;
        obj[name] = { byteOffset, Wrapper };
        byteOffset += new Wrapper(0).bytes;
    }

    return Object.freeze(obj);
}

const headerLayout = createHeaderLayout(headerLayoutWrappers);

/**
 * Uses HeaderLayout to interpret an existing buffer's data, and handle reads and writes
 */
export default class AudioDataManager {
    private view: DataView;

    constructor(buf: ArrayBufferLike) {
        this.view = new DataView(buf);
    }

    setFormat(data: Record<keyof HeaderLayout, number | bigint>) {
        for (const [key, value] of Object.entries(data) as [keyof typeof data, number | bigint][]) {
            const { byteOffset, Wrapper } = headerLayout[key];
            const wrappedValue = new Wrapper(value);
            
            let methodName = "";
            if (!wrappedValue.signed) {
                methodName += "u";
            }
            if (wrappedValue.float) {
                methodName += "float";
            } else {
                methodName += "int";
            }
            methodName += `${wrappedValue.bytes * 8}`;
            methodName = "set" + methodName.substring(0, 1).toUpperCase() + methodName.substring(1, methodName.length);

            const method = this.view[methodName as keyof typeof this.view] as Function;
            if (wrappedValue.float) {
                method(byteOffset, wrappedValue.normalizeValue(Number(value)));
            } else {
                method(byteOffset, wrappedValue.normalizeValue(value));
            }
        }
    }

    getHeaderSize(): number {
        return Object.values(headerLayout).reduce((prev, curr, i, arr) => {
            let value = curr.byteOffset;
            if (i === arr.length-1) {
                value += new curr.Wrapper(0).bytes;
            }
            return prev + value;
        }, 0);
    }

    getMaxBodySize(): number {
        const { inputCount, channelCount, fftRatio, sampleRate } = headerLayoutWrappers;

        // TODO: calculate max body size, with at least 1 inputCount's worth of extra audio data
        // ...
    }
}