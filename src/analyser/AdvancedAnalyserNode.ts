import { Dictionary } from "../utils/types";
import strictObjectAssign from "../utils/strictObjectAssign";
import AudioDataManager from "./AudioDataManager";

export type InitData = {
    sab: SharedArrayBuffer
};

export type MessagePayload =
{
    type: "init",
    data: InitData
}
;

export default class AdvancedAnalyserNode extends AudioWorkletNode {    
    public readonly sab: SharedArrayBuffer;

    /**
     * Not recommended calling constructor directly. Call the static async "create" method instead.
     */
    constructor(context: AudioContext) {
        super(context, "advanced-analyser-processor");
        
        const sab = new SharedArrayBuffer(
            AudioDataManager.estimateBufSize(this.numberOfInputs, this.channelCount)
        );
        this.sab = sab;
        const msg: MessagePayload = {
            type: "init",
            data: {
                sab
            }
        };
        this.port.postMessage(msg);
        this.port.onmessage = this.handleMessage.bind(this);
    }

    private handleMessage(e: MessageEvent<MessagePayload>): void {
        const { type, data } = e.data;

        switch(type) {
            
        }
    }

    /**
     * Loads processor into module, then instanciates the analyser
     * @param context 
     * @returns 
     */
    public static async create(context: AudioContext): Promise<AdvancedAnalyserNode> {
        const processorUrl = new URL("./AdvancedAnalyserProcessor", import.meta.url);
        await context.audioWorklet.addModule(processorUrl);

        const analyser = new AdvancedAnalyserNode(context);
        return analyser;
    }
}