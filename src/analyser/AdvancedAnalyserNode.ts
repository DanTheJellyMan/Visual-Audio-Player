import { Dictionary } from "../utils/types";
import strictObjectAssign from "../utils/strictObjectAssign";
import AudioDataManager from "./AudioDataManager";

export type Config = Dictionary & {
    
};

export type InitData = {
    sab: SharedArrayBuffer
};

export type MessagePayload = {
    type: MessagePayloadType,
    data: MessagePayloadData
};

type MessagePayloadType = "config-update";
type MessagePayloadData = Config;

export default class AdvancedAnalyserNode extends AudioWorkletNode {
    public static readonly MAX_BUF_LEN = 2**15; // TODO: determine what this value should be
    
    public readonly sab: SharedArrayBuffer;
    private config: Config = {

    };

    /**
     * Not recommended calling constructor directly. Call the static async "create" method instead.
     */
    constructor(context: AudioContext) {
        // TODO: create a buffer layout map for sending/reading data based on config.
        // The map will dynamically change, and should be considered for workers.
        const manager = new AudioDataManager();
        const processorOptions: InitData = {
            sab: new SharedArrayBuffer(AdvancedAnalyserNode.MAX_BUF_LEN)
        };
        super(context, "advanced-analyser-processor", { processorOptions });

        this.sab = processorOptions.sab;

        this.assignConfig(this.config);
    }

    public assignConfig(config: Config): void {
        strictObjectAssign(this.config, config);

        const msg: MessagePayload = {
            type: "config-update",
            data: this.config
        };

        this.port.postMessage(msg);
    }

    public static async create(context: AudioContext): Promise<AdvancedAnalyserNode> {
        const processorUrl = new URL("../../AdvancedAnalyserProcessor.js", import.meta.url);
        await context.audioWorklet.addModule(processorUrl);
        
        const analyser = new AdvancedAnalyserNode(context);
        return analyser;
    }
}