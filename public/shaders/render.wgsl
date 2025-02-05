// This is just the output of my vertex shader
struct VertexOutput {
  @builtin(position) position : vec4<f32>, // Where to map vertices in screen
  @location(0) fragUV : vec2<f32>, // UV coords for fragment shader
};

// This vertex shader initializes two triangles across the entire viewport
@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
  );
  var output: VertexOutput;
  output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  output.fragUV = (positions[vertexIndex] + vec2<f32>(1.0)) * 0.5; // Convert to 0-1 UV
  return output;
}

@group(0) @binding(0) var<storage, read> density : array<f32>;
@group(0) @binding(1) var<uniform> gridSize : u32;

@fragment
fn fragment_main(@location(0) fragUV: vec2<f32>) -> @location(0) vec4<f32> {
  let x = u32(fragUV.x * f32(gridSize));
  let y = u32(fragUV.y * f32(gridSize));
  let idx = y * gridSize + x;
  let value = density[idx];
  return vec4<f32>(value, value, value, 1.0);
}