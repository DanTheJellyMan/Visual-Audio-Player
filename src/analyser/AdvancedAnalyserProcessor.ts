type AudioInputs = Float32Array<ArrayBufferLike>[][];

class AdvancedAnalyserProcessor extends AudioWorkletProcessor {
    private options: AudioWorkletNodeOptions;

    constructor(options: AudioWorkletNodeOptions) {
        super();
        this.options = options;
    }

    process(inputs: AudioInputs[], outputs: AudioInputs[], parameters: AudioParamMap): boolean {
        // do some processing...

        copyArrayTo(inputs, outputs);

        return true;
    }
}

registerProcessor("advanced-analyser-processor", ((AdvancedAnalyserProcessor as unknown) as AudioWorkletProcessorConstructor));

function copyArrayTo(source: Array<unknown>, target: Array<unknown>): void {
    for (let i=0; i<source.length; i++) {
        const it1Proto = Object.getPrototypeOf(source[i]);
        const it2Proto = Object.getPrototypeOf(target[i]);
        if (it1Proto === Array.prototype && it2Proto === Array.prototype) {
            copyArrayTo(source[i] as Array<unknown>, target[i] as Array<unknown>);
        } else {
            target[i] = source[i];
        }
    }
}