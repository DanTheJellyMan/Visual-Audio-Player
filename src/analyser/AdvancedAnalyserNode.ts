import processorUrl from "./AdvancedAnalyserProcessor.ts?worker&url";
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
     * Not recommended calling constructor directly.
     * Call the static async "create" method instead.
     */
    constructor(context: AudioContext) {
        // For testing while I figure out what to do for multiple audio channels
        super(context, "advanced-analyser-processor", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
            channelCountMode: "explicit",
            channelInterpretation: "speakers"
        });
        if (!Object.hasOwn(globalThis, "SharedArrayBuffer")) {
            throw new Error("SharedArrayBuffer is not supported on this site");
        }

        const sabSize = AudioDataManager.estimateBufSize(
            this.numberOfInputs,
            this.channelCount
        );
        const sab = new SharedArrayBuffer(sabSize);
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
        await context.audioWorklet.addModule(processorUrl);
        const analyser = new AdvancedAnalyserNode(context);
        return analyser;
    }
}