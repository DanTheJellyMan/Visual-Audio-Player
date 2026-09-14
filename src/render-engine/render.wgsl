struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f
}

@group(0) @binding(1)
var<storage, read> samples_db: array<f32>;

@vertex
fn vert_main(
    @builtin(instance_index) sample_index: u32,
    @builtin(vertex_index) vertex_index: u32
) -> VertexOut {
    // db: [-120, 0]
    let db = samples_db[sample_index];
    let sample_count = gl_uniforms.fft.size / 2u;
    let width = 2.0 / f32(sample_count);

    let tri_v = vertex_index % 3u;
    var x = f32(sample_index) / f32(sample_count) * 2.0 - 1.0 + (1.0 / f32(sample_count));
    var y: f32;
    
    // Vertex order:
    if (tri_v == 0) {
        // BL
        x -= width / 2.0;
        y = -1.0;
    } else if (tri_v == 1) {
        // TR
        x += width / 2.0;
        y = (db / 120.0) * 2.0 + 1.0;
    } else {
        if (vertex_index == 5) {
            // BR
            x += width / 2.0;
            y = -1.0;
        } else {
            // TL
            x -= width / 2.0;
            y = (db / 120.0) * 2.0 + 1.0;
        }
    }

    let position = vec4f(x, y, 0.5, 1.0);

    let r = f32(sample_index%4)/3.0;
    let b = f32(sample_index%2);
    let color = select(
        vec4f(r/2.0, r*b/3.0, b, 1.0),
        vec4f(0.9, 0.25/4.0, 0.75, 1.0),
        vec4(r == 0.0 && b == 0.0)
    );

    var output: VertexOut;
    output.position = position;
    output.color = color;
    return output;
}

@fragment
fn frag_main(fragData: VertexOut) -> @location(0) vec4f {
    return fragData.color;
}