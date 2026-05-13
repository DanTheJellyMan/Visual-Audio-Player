import { Dictionary } from "./types";

/**
 * Similar to Object.assign, but only assigns props from src if they are also found in target. Example:
 * 
 * const obj = { name: "Joe", age: -1 }; const otherObj = { lastName: "Alex", age: 69 };
 * 
 * strictObjectAssign(obj, otherObj);
 * 
 * console.log(obj); // { name: "Joe", age: 69 }
 * @param target 
 * @param src 
 */
export default function strictObjectAssign(target: Dictionary, src: Dictionary): void {
    for (const [srcKey, srcValue] of Object.entries(src)) {
        if (!Object.hasOwn(target, srcKey) || typeof target[srcKey] !== typeof srcValue) continue;
        if (getConstructor(target[srcKey]) === Object && getConstructor(srcValue) === Object) {
            // TODO: make this iterative instead of recursive
            strictObjectAssign(target[srcKey] as Dictionary, srcValue as Dictionary);
        } else {
            target[srcKey] = srcValue;
        }
    }
}

function getConstructor(obj: Object): Function {
    return Object.getPrototypeOf(obj).constructor;
}