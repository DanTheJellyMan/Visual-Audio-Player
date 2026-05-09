import { TypedArray } from "../utils/types";

class AdvancedAnalyserProcessor extends AudioWorkletProcessor {
    private options: AudioWorkletNodeOptions;

    constructor(options: AudioWorkletNodeOptions) {
        super();
        this.options = options;
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: AudioParamMap): boolean {
        const sab: SharedArrayBuffer = this.options.processorOptions.sab;
        const targetArr = new Float32Array(sab);
        
        // Handle sending input data thru array buffer
        // ...
        targetArr.set();
        copyArrayTo(inputs, outputs);
        return true;
    }
}

registerProcessor("advanced-analyser-processor", ((AdvancedAnalyserProcessor as unknown) as AudioWorkletProcessorConstructor));

function copyArrayTo(source: unknown[], target: unknown[]): void {
    for (let i=0; i<source.length; i++) {
        const it1Proto = Object.getPrototypeOf(source[i]);
        const it2Proto = Object.getPrototypeOf(target[i]);
        if (it1Proto === Array.prototype && it2Proto === Array.prototype) {
            copyArrayTo(source[i] as unknown[], target[i] as unknown[]);
        } else {
            target[i] = source[i];
        }
    }
}