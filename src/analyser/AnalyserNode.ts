export default class AnalyserNode extends AudioWorkletNode {
    public static readonly MAX_BUF_LEN = 2**15; // TODO: determine what this value should be

    public static async create(context: AudioContext, sab: SharedArrayBuffer): Promise<AnalyserNode> {
        await context.audioWorklet.addModule("analyser-processor");

        const analyser = new AnalyserNode(context, "analyser-processor", {
            processorOptions: {
                sab
            }
        });

        return analyser;
    }
}