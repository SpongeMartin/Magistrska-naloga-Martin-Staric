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
@group(0) @binding(1) var<storage, read> velocity : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> pressure : array<f32>;
@group(0) @binding(3) var<storage, read> divergence : array<f32>;
@group(0) @binding(4) var<uniform> gridSize : u32;
@group(0) @binding(5) var<uniform>  renderMode : u32;


@fragment
fn fragment_main(@location(0) fragUV: vec2<f32>) -> @location(0) vec4<f32> {
  let x = u32(fragUV.x * f32(gridSize));
  let y = u32(fragUV.y * f32(gridSize));
  let idx = y * gridSize + x;
  if(renderMode == 0){
    let density_value = density[idx];
    return vec4<f32>(density_value, density_value, density_value, 1.0);
  }
  else if(renderMode == 1){
    let velocity_vector = velocity[idx];
    if(velocity_vector[0] < 0){
      return vec4<f32>(abs(velocity_vector[0]) * 100.0, 0, 0, 1.0);
    }
    else{
      return vec4<f32>(0, 0, velocity_vector[0] * 100.0, 1.0);
    }
  }
  else if(renderMode == 2){
    let pressure_value = pressure[idx];
    if(pressure_value < 0){
      return vec4<f32>(abs(pressure_value) * 40.0, 0,0, 1.0);
    }
    else{
      return vec4<f32>(0, 0,pressure_value * 40.0, 1.0);
    }
  }
  else{
    let divergence_value = divergence[idx];
    if(divergence_value < 0){
      return vec4<f32>(abs(divergence_value) * 40.0, 0,0, 1.0);
    }
    else{
      return vec4<f32>(0, 0,divergence_value * 40.0, 1.0);
    }
  }
}