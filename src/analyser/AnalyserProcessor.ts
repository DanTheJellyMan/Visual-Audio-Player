type AudioInputs = Float32Array<ArrayBufferLike>[][];

class AnalyserProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
    }

    process(inputs: AudioInputs[], outputs: AudioInputs[], parameters: AudioParamMap): boolean {
        // do some processing...

        return true;
    }
}

registerProcessor("analyser-processor", ((AnalyserProcessor as unknown) as AudioWorkletProcessorConstructor));