export default class AdvancedAnalyserNode extends AudioWorkletNode {
    public static readonly MAX_BUF_LEN = 2**15; // TODO: determine what this value should be
    public readonly sab: SharedArrayBuffer;

    constructor(context: AudioContext) {
        const sab = new SharedArrayBuffer(AdvancedAnalyserNode.MAX_BUF_LEN);
        super(context, "advanced-analyser-processor", {
            processorOptions: {
                sab
            }
        });

        this.sab = sab;
    }

    public static async create(context: AudioContext): Promise<AdvancedAnalyserNode> {
        const processorUrl = new URL("../../AdvancedAnalyserProcessor.js", import.meta.url);
        await context.audioWorklet.addModule(processorUrl);
        
        const analyser = new AdvancedAnalyserNode(context);
        return analyser;
    }
}