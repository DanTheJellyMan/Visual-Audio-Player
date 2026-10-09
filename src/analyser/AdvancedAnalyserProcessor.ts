import { TypedArray, Dictionary } from "../utils/types";
import strictObjectAssign from "../utils/strictObjectAssign";
import { MessagePayload } from "./AdvancedAnalyserNode";
import AudioDataManager, { Process } from "./AudioDataManager";

type ParameterDescriptor = {
    name: string,
    automationRate: "a-rate" | "k-rate",
    minValue: number,
    maxValue: number,
    defaultValue: number
};

/**
 * The value of each entry is the count of the code which has been returned
 */
type ProcessWriteInfo = {
    lastCode: string,
    codes: { [processWriteInfoCode: string]: number }
};

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
    private procWriteInfo: ProcessWriteInfo = {
        lastCode: "",
        codes: {}
    };

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
                this.manager.initHeader(
                    sampleRate,
                    AudioDataManager["FFT_RATIO_MIN"].value
                );
                break;
            }
        }
    }

    process(
        inputs: Process,
        outputs: Process,
        parameters: Record<string, Float32Array>
    ): boolean {
        const { manager } = this;
        if (manager) {
            manager.setHeader({
                currentFrame: BigInt(currentFrame),
                currentTime
            });

            const result = manager.writeProcess(inputs);
            this.handleProcessLog(result);
        }

        copyInputsToOutputs(inputs, outputs);
        return true;
    }

    private handleProcessLog(code: number): void {
        const { procWriteInfo } = this;
        const codeStr = String(code);
        if (!Object.hasOwn(procWriteInfo.codes, codeStr)) {
            procWriteInfo.codes[codeStr] = 0;
        }
        procWriteInfo.codes[codeStr]++;
        procWriteInfo.lastCode = codeStr;
        for (const code of Object.keys(procWriteInfo.codes)) {
            if (code === codeStr) continue;
            const codeCt = procWriteInfo.codes[code];
            procWriteInfo.codes[code] = Math.max(0, codeCt-1);
        }

        const errorLogFn = parseInt(codeStr) % 2 === 0
        ? console.warn
        : console.error;
        if (codeStr !== "0" && procWriteInfo.codes[codeStr] <= 2) {
            errorLogFn.call(
                null,
                `AudioDataManager process writing error (${codeStr})`
            );
        }
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