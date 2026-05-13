import { Dictionary } from "../utils/types";
import strictObjectAssign from "../utils/strictObjectAssign";
import * as AnalyserUtils from "../utils/analyserUtils";

export type AdvancedAnalyserConfig = {
    sab: SharedArrayBuffer
};

export type AnalyserWorkletMessagePayload = {
    type: string,
    data: AnalyserWorkletMessageData
}
type AnalyserWorkletMessageData = {

}

export default class AdvancedAnalyserNode extends AudioWorkletNode {
    public static readonly MAX_BUF_LEN = 2**15; // TODO: determine what this value should be
    
    public config: AdvancedAnalyserConfig;

    /**
     * Not recommended calling constructor directly. Call the static async "create" method instead.
     */
    constructor(context: AudioContext) {
        // TODO: create a buffer layout map for sending/reading data based on config.
        // The map will dynamically change, and should be considered for workers.
        const config: AdvancedAnalyserConfig = {
            sab: new SharedArrayBuffer(AdvancedAnalyserNode.MAX_BUF_LEN)
        };

        super(context, "advanced-analyser-processor", {
            // Initial values
            parameterData: {

            }
        });

        this.assignConfig();
        this.config = config;
    }

    public assignConfig(obj: Dictionary): void {
        strictObjectAssign(this.config, obj);
        this.port.postMessage();
    }

    public static async create(context: AudioContext): Promise<AdvancedAnalyserNode> {
        const processorUrl = new URL("../../AdvancedAnalyserProcessor.js", import.meta.url);
        await context.audioWorklet.addModule(processorUrl);
        
        const analyser = new AdvancedAnalyserNode(context);
        return analyser;
    }
}