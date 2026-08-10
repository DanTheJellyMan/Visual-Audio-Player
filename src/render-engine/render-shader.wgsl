struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f
}

@group(0) @binding(0)
var<storage, read> samples_db: array<f32>;

@vertex
fn vert_main(
    @builtin(vertex_index) vertex_index: u32,
    // @location(0) position: vec4f,
    // @location(1) color: vec4f
) -> VertexOut {
    // db: [-120, 0]
    let sample_index = vertex_index / 6u;
    let db = samples_db[sample_index];
    let sample_count = arrayLength(&samples_db);
    let width = 2.0 / f32(sample_count);

    let tri_v = vertex_index % 3u;
    var x = f32(vertex_index) / f32(sample_count) * 2.0 - 1.0 + (1.0 / f32(sample_count));
    var y: f32;
    // Vertex order:
    if (tri_v == 0) { // BL
        x -= width / 2.0;
        y = -1.0;
    } else if (tri_v == 1) { // TR
        x += width / 2.0;
        y = (db / 120.0) * 2.0 + 1.0;
    } else {
        if (vertex_index % 6u < 3) { // TL
            x -= width / 2.0;
            y = (db / 120.0) * 2.0 + 1.0;
        } else { // BR
            x += width / 2.0;
            y = -1.0;
        }
    }

    var output: VertexOut;
    output.position = vec4f(x, y, 0.5, 1.0);
    output.color = vec4f(1.0, 0.0, 1.0, 1.0);
    return output;
}

@fragment
fn frag_main(fragData: VertexOut) -> @location(0) vec4f {
    return fragData.color;
}