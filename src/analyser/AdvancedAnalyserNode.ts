import { Dictionary } from "../utils/types";
import strictObjectAssign from "../utils/strictObjectAssign";
import AudioDataManager from "./AudioDataManager";

export type InitData = {
    sab: SharedArrayBuffer
};
export type Config = {
    fps: number,
    fftRatio: number
};

export type MessagePayload =
    {
        type: "init",
        data: InitData
    } |
    {
        type: "config-update",
        data: Config
    }
;

export default class AdvancedAnalyserNode extends AudioWorkletNode {    
    public readonly sab: SharedArrayBuffer;
    private readonly config: Config = {
        fps: 30,
        fftRatio: Math.round((AudioDataManager.FFT_RATIO_MIN.value + AudioDataManager.FFT_RATIO_MAX.value) / 2)
    };

    /**
     * Not recommended calling constructor directly. Call the static async "create" method instead.
     */
    constructor(context: AudioContext) {
        super(context, "advanced-analyser-processor");
        
        const sab = new SharedArrayBuffer(
            AudioDataManager.estimateBufSize(this.numberOfInputs, this.channelCount)
        );
        const msg: MessagePayload = {
            type: "init",
            data: {
                sab
            }
        };

        this.port.postMessage(msg);
        this.sab = sab;

        this.assignConfig(this.config);
    }

    public assignConfig(config: Partial<Config>): void {
        strictObjectAssign(this.config, config);

        const msg: MessagePayload = {
            type: "config-update",
            data: this.config
        };

        this.port.postMessage(msg);
    }

    public static async create(context: AudioContext): Promise<AdvancedAnalyserNode> {
        const processorUrl = new URL("./AdvancedAnalyserProcessor", import.meta.url);
        await context.audioWorklet.addModule(processorUrl);

        const analyser = new AdvancedAnalyserNode(context);
        return analyser;
    }
}