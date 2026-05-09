import { TypedArray } from "./types.ts";

/**
 * Fully flattens any iterable, including Array and TypedArray
 */
export default function fullyFlatten(arr: unknown[]): unknown[] {
    const typedArrClass: Function = Object.getPrototypeOf(Object.getPrototypeOf(new Float32Array())).constructor;
    const output = [];
    for (let i=0; i<arr.length; i++) {
        const it = arr[i];
        const cl = Object.getPrototypeOf(it);
        if (cl instanceof typedArrClass) {
            output.push(...(it as TypedArray));
        } else if (cl instanceof Array) {
            output.push(...fullyFlatten(it as unknown[]));
        } else {
            output.push(it);
        }
    }
    return output;
}