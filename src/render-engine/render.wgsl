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

    let prog_x = f32(sample_index) / f32(sample_count);
    let prog_y = (y + 1.0) / 2.0;
    let r_x = f32(sample_index%15)/14.0 * prog_x;
    let g_x = (1.0 - prog_x) / 2.0;
    let b_x = (cos(f32(sample_index%2) * f32(sample_index%7))+1.0)/3.25;
    let avg = (r_x+g_x+b_x)/3.0;
    let color = select(
        vec4f(r_x+(b_x*0.075), g_x-(b_x*0.3), b_x-(b_x*0.15), 1.0),
        vec4f(mix(r_x, 1.0, 0.5), mix(g_x, 0.75, 0.4), mix(b_x, 0.825, 0.125), 1.0),
        vec4(sample_index%17==0||sample_index%13==0||sample_index%37==0)
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