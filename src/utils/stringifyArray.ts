import { TypedArray } from "./types";

/**
 * 
 * @param headers 
 * @param arrays 
 * @param newline 
 * @returns 
 */
export default function stringifyArrays(headers: string[], arrays: (any[] | TypedArray)[], newline = false): string {
    if (headers.length !== arrays.length) {
        throw new Error(`Headers and arrays length do not match: ${headers.length}, ${arrays.length}`);
    }

    let finalStr = "";
    let appendStr = "";
    for (let i=0; i<headers.length; i++) {
        const header = headers[i];
        const arr = arrays[i];
        const arrStr = `[${arr.join(", ")}]`;
        
        if (!newline) {
            finalStr += header.padEnd(arrStr.length, " ") + " ";
            appendStr += arrStr.padEnd(header.length, " ") + " ";
        } else {
            const dot = i === headers.length-1 ? "" : ".\n";
            finalStr += `${header}\n${arrStr}\n${dot}`;
        }
    }

    return finalStr + "\n" + appendStr;
}