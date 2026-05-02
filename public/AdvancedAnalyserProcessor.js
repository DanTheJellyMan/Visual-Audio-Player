"use strict";
class AdvancedAnalyserProcessor extends AudioWorkletProcessor {
    options;
    constructor(options) {
        super();
        this.options = options;
    }
    process(inputs, outputs, parameters) {
        // do some processing...
        copyArrayTo(inputs, outputs);
        return true;
    }
}
registerProcessor("advanced-analyser-processor", AdvancedAnalyserProcessor);
function copyArrayTo(source, target) {
    for (let i = 0; i < source.length; i++) {
        const it1Proto = Object.getPrototypeOf(source[i]);
        const it2Proto = Object.getPrototypeOf(target[i]);
        if (it1Proto === Array.prototype && it2Proto === Array.prototype) {
            copyArrayTo(source[i], target[i]);
        }
        else {
            target[i] = source[i];
        }
    }
}
