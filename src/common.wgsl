struct GlobalUniforms {
    fft: FFTUniforms,
    // render: RenderUniforms
}

struct FFTUniforms {
    size: u32,
    inverse_bool: u32
}

struct RenderUniforms {
    time: u32
}

@group(0) @binding(0)
var<uniform> gl_uniforms: GlobalUniforms;