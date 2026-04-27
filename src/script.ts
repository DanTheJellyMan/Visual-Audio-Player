import AnalyserNode from "./analyser/AnalyserNode.js";

const sab = new SharedArrayBuffer(0, { maxByteLength: AnalyserNode.MAX_BUF_LEN });
const audioContext = new AudioContext();

const analyser = AnalyserNode.create(audioContext, sab);