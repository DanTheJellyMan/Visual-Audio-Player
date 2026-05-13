import { TypedArray } from "../utils/types";
import { AdvancedAnalyserConfig } from "./AdvancedAnalyserNode";

class AdvancedAnalyserProcessor extends AudioWorkletProcessor {
    private options: AudioWorkletNodeOptions;
    private config: AdvancedAnalyserConfig | null = null;

    constructor(options: AudioWorkletNodeOptions) {
        super();
        this.options = options;
        
        this.port.addEventListener("message", this.handleNodeMessage);
    }

    private handleMessage(e: MessageEvent<>) {
        const {  } = e.data;
        switch(e.)
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
        if (this.config !== null) {
            const { sab } = this.config;
            const targetArr = new Float32Array(sab);
            
            // Handle sending input data thru array buffer
            // ...
            targetArr.set();
        }

        copyArrayTo(inputs, outputs);
        return true;
    }
}

registerProcessor("advanced-analyser-processor", (AdvancedAnalyserProcessor as unknown) as AudioWorkletProcessorConstructor);

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