// struct VertexOut
// {
//     @builtin(position) position: vec4,
// }

// var<storage, read_write> arr: array<>;

// @vertex @workgroup_size(64)
// fn vertex_main(@location(0) position: vec4f) -> VertexOut
// {
//     var output: VertexOut;
//     output.position = position;
//     return output;
// }

// @fragment @workgroup_size(64)
// fn fragment_main(fragData: VertexOut) -> @builtin(position)
// {
//     return vec4f(1.0, 0.5, 1.0, 1.0);
// }