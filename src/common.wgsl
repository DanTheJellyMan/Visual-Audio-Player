struct GlobalUniforms {
    fft: FFTUniforms,
}

struct FFTUniforms {
    size: u32,
    inverse_bool: u32,
    stage: u32
}

@group(0) @binding(0)
var<uniform> gl_uniforms: GlobalUniforms;