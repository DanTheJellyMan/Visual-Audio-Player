import { TypedArray, Dictionary } from "../utils/types";
import strictObjectAssign from "../utils/strictObjectAssign";
import { Config, MessagePayload } from "./AdvancedAnalyserNode";
import AudioDataManager, { Process } from "./AudioDataManager";

type ParameterDescriptor = {
    name: string,
    automationRate: "a-rate" | "k-rate",
    minValue: number,
    maxValue: number,
    defaultValue: number
};
export type ParameterDescriptors = typeof AdvancedAnalyserProcessor["_parameterDescriptors"];

class AdvancedAnalyserProcessor extends AudioWorkletProcessor {
    // TODO: figure out what to do about potential parameterDescriptors, like
    // how they should be sent through the manager
    public static _parameterDescriptors: ParameterDescriptor[] = [
        
    ] as const;

    static get parameterDescriptors() {
        return AdvancedAnalyserProcessor._parameterDescriptors;
    }

    private options: AudioWorkletNodeOptions;
    private manager: AudioDataManager | null = null;
    // TODO: check if Config is necessary or if parameterDescriptors can be used instead
    private config: Config | null = null;

    constructor(options: AudioWorkletNodeOptions) {
        super();
        this.options = options;

        this.port.onmessage = this.handleMessage.bind(this);
    }

    private handleMessage(e: MessageEvent<MessagePayload>): void {
        const { type, data } = e.data;

        switch(type) {
            case "init": {
                const { sab } = data;
                this.manager = new AudioDataManager(sab);
                this.manager.initHeader(sampleRate, AudioDataManager["FFT_RATIO_MIN"].value);
                break;
            }
            case "config-update": {
                const dict = this.config ? this.config : data;
                strictObjectAssign(dict, data);
                this.config = dict;
                break;
            }
        }
    }

    process(inputs: Process, outputs: Process, parameters: Record<string, Float32Array>): boolean {
        const { manager, config } = this;
        if (manager && config) {
            manager.setHeader({
                currentFrame: BigInt(currentFrame),
                currentTime,
                fftRatio: config.fftRatio
            });

            const result = manager.writeProcess(inputs);
            if (result !== 0) {
                console.error(`AudioDataManager process writing error (${result})`);
            }
        }

        copyInputsToOutputs(inputs, outputs);
        return true;
    }
}

registerProcessor("advanced-analyser-processor", AdvancedAnalyserProcessor);

function copyInputsToOutputs(inputs: Process, outputs: Process): void {
    for (let i=0; i<inputs.length; i++) {
        for (let j=0; j<inputs[i].length; j++) {
            outputs[i][j].set(inputs[i][j]);
        }
    }
}