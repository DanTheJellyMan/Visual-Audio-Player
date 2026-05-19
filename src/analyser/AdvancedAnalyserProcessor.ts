import { TypedArray, Dictionary } from "../utils/types";
import strictObjectAssign from "../utils/strictObjectAssign";
import { InitData, Config, MessagePayload } from "./AdvancedAnalyserNode";

class AdvancedAnalyserProcessor extends AudioWorkletProcessor {
    private sab: InitData["sab"];
    private options: AudioWorkletNodeOptions;
    private config: Config | null = null;

    constructor(options: AudioWorkletNodeOptions) {
        super();
        this.options = options;
        
        const initData: InitData = options.processorOptions;
        this.sab = initData.sab;

        this.port.addEventListener("message", this.handleMessage);
    }

    private handleMessage(e: MessageEvent<MessagePayload>) {
        const { type, data } = e.data;

        switch(type) {
            case "config-update": {
                const dict: Dictionary = this.config ? this.config : {};
                strictObjectAssign(dict, data);
                this.config = dict;
                break;
            }
        }
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
        if (this.config !== null) {
            const targetArr = new Float32Array(this.sab);
            
            // Handle sending input data thru array buffer
            // ...
            // targetArr.set();
            this
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