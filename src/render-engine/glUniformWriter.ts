import { WgslReflect, VariableInfo, MemberInfo } from "wgsl_reflect";

export type OutputData = {
    byteData: ArrayBuffer,
    gpuBufOffset: number
};

type NestedNumberArray = number[] | NestedNumberArray[];

/**
 * Determines where and how the inputted data should be written into the GPUBuffer
 * for the common shader's global uniform. This function does not modify any data
 * @param commonReflect 
 * @param tMemN The name of the target member to modify in the uniform
 * @param values 
 * @returns 
 */
export default function glUniformWriter(
    commonReflect: WgslReflect,
    tMemN: string,
    values: number[]
): OutputData {
    const glUni = commonReflect.uniforms
    .find((uni) => uni.type.name === "GlobalUniforms");
    if (glUni === undefined) {
        throw new Error("Could not find global uniform from common shader");
    }

    const tMemArr = tMemN.split(".");
    let nextGlUniMem: MemberInfo | typeof glUni = glUni;
    let tMemArrI = 0;
    let tMemInfo: MemberInfo | undefined;
    let gpuBufOffset = 0;

    while(tMemArrI < tMemArr.length) {
        const tMemIt = tMemArr[tMemArrI];
        const glUniMems: MemberInfo[] = nextGlUniMem.members!;
        const next = glUniMems.find((mem) => mem.name === tMemIt);
        if (!next) break;

        nextGlUniMem = next;
        gpuBufOffset += nextGlUniMem.offset
        tMemArrI++;
    }
    if (tMemArrI !== tMemArr.length) {
        throw new Error(`Could not find member of global uniform ${tMemN}`);
    }
    tMemInfo = nextGlUniMem as MemberInfo;

    // TODO: add support for non-scalar value types
    let abSize = 0;
    let viewFnN: keyof DataView;
    switch(tMemInfo.type.name) {
        case "f32":
            abSize = Float32Array.BYTES_PER_ELEMENT;
            viewFnN = "setFloat32";
            break;
        case "i32":
            abSize = Int32Array.BYTES_PER_ELEMENT;
            viewFnN = "setInt32";
            break;
        case "u32":
            abSize = Uint32Array.BYTES_PER_ELEMENT;
            viewFnN = "setUint32";
            break;
        default:
            throw new Error(`Unsupported data type: ${tMemInfo.type.name}`);
    }
    const ab = new ArrayBuffer(abSize);
    const view = new DataView(ab);
    view[viewFnN](0, values[0], true);

    return {
        byteData: ab,
        gpuBufOffset
    };
}