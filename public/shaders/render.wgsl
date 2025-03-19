struct VertexOutput {
  @builtin(position) pos : vec4<f32>,
  @location(0) rayFrom : vec3<f32>,
  @location(1) rayTo : vec3<f32>,
  @location(2) normal : vec3<f32>,
  @location(3) fraguv : vec2f
};

@group(0) @binding(0) var<uniform> modelMatrix : mat4x4<f32>;
@group(0) @binding(1) var<uniform> viewMatrix : mat4x4<f32>;
@group(0) @binding(2) var<uniform> projMatrix : mat4x4<f32>;
@group(0) @binding(3) var<uniform> invMVPMatrix : mat4x4<f32>;

@vertex
fn vertex_main(@location(0) position: vec4f,
  @location(1) uv: vec2f) -> VertexOutput {
    let screenSpace = projMatrix * viewMatrix * modelMatrix * position;
    let nearPosition = vec4<f32>(screenSpace.xy, -1.0, 1.0);
    let farPosition = vec4<f32>(screenSpace.xy, 1.0, 1.0);
    let fromDirty = invMVPMatrix * nearPosition;
    let toDirty = invMVPMatrix * farPosition;

    var output: VertexOutput;
    output.pos = projMatrix * viewMatrix * modelMatrix * position;
    output.rayFrom = fromDirty.xyz / fromDirty.w;
    output.rayTo = toDirty.xyz / toDirty.w;
    output.normal = normalize(screenSpace.xyz); //wrong for now
    output.fraguv = uv;
    /*let ndc = vec3<f32>((projMatrix * viewMatrix * modelMatrix * position).xy * 2.0 - 1.0, 1.0);
    var worldDirection = (invMVPMatrix * vec4<f32>(ndc, 0.0)).xyz;
    worldDirection = normalize(worldDirection);
    var output: VertexOutput;
    output.pos = projMatrix * viewMatrix * modelMatrix * position;
    output.rayFrom = vec3(0.0);
    output.rayTo = worldDirection * 100.0;
    output.normal = normalize(position.xyz);
    output.fraguv = uv;*/
    return output;
}

@group(0) @binding(4) var<storage, read> density : array<f32>;
@group(0) @binding(5) var<storage, read> velocity : array<vec3<f32>>;
@group(0) @binding(6) var<storage, read> pressure : array<f32>;
@group(0) @binding(7) var<storage, read> divergence : array<f32>;
@group(0) @binding(8) var<uniform> gridSize : u32;
@group(0) @binding(9) var<uniform> renderMode : u32;
//@group(0) @binding(9) var<uniform> stepSize : f32;


fn intersectCube(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec2<f32> {
    //Slab method for computing cube intercept
    let tMin = (vec3(0.0) - rayOrigin) / rayDir;
    let tMax = (vec3(1.0) - rayOrigin) / rayDir;
    let t1 = min(tMin, tMax);
    let t2 = max(tMin, tMax);
    let tNear = max(max(t1.x, t1.y), t1.z);
    let tFar = min(min(t2.x, t2.y), t2.z);
    return vec2<f32>(tNear, tFar);
}

fn sampleDensity(position: vec3<f32>) -> vec4<f32> {
  let id = vec3<u32>(floor(position * f32(gridSize)));
  let idx = id.x + id.y * gridSize + id.z * gridSize * gridSize;
  return vec4(1.0, 1.0, 1.0, density[idx]);
}

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) vec4<f32> {
  if(renderMode == 0){
    let x = u32(in.fraguv.x * f32(gridSize));
    let y = u32(in.fraguv.y * f32(gridSize));
    var accumulatedDensity = 0.0;
    for (var z: u32 = 0; z < gridSize; z++){
      let idx = z * gridSize * gridSize + y * gridSize + x;
      accumulatedDensity += density[idx];
      if(accumulatedDensity >= 1.0){
        accumulatedDensity = 1.0;
        break;
      }
    }
    return vec4<f32>(accumulatedDensity, accumulatedDensity, accumulatedDensity, 1.0);
  }

  if(renderMode == 1){
    let rayDir = in.rayTo - in.rayFrom;
    let tbounds = max(intersectCube(in.rayFrom,rayDir), vec2(0.0));
    var oColor = vec4(0.0,0.0,0.0,1.0);
    oColor = vec4(tbounds.x, tbounds.y, 0.0, 1.0);
    let stepSize = 0.1;
    if (tbounds.x < tbounds.y) {
      let frm = mix(in.rayFrom, in.rayTo, tbounds.x);
      let to = mix(in.rayFrom, in.rayTo, tbounds.y);
      let rayStepLength = distance(frm, to) * stepSize;

      let uOffset = 1.0;
      var t = stepSize * uOffset;
      var accumulator = vec4(0.0);

      while (t < 1.0 && accumulator.a < 0.99) {
          let position = mix(frm, to, t);
          var colorSample = sampleDensity(position);
          /*let uExtinction = 1.0;
          colorSample.a *= rayStepLength * uExtinction;
          colorSample.r *= colorSample.a;
          colorSample.g *= colorSample.a;
          colorSample.b *= colorSample.a;
          accumulator = accumulator + (1.0 - accumulator.a) * colorSample;*/
          accumulator += (1.0 - accumulator.a) * colorSample;
          t += stepSize;
      }

      oColor = sampleDensity(mix(frm, to, 0.5));
    }
    return oColor;
  }

  let lighting = max(dot(in.normal, vec3<f32>(1.0, 0.0, 0.0)), 0.1);
  let a = density[0] + velocity[0][0] + pressure[0] + divergence[0];
  let gs = gridSize * gridSize;
  let ren = renderMode + 1;
  let viewPos = vec3<f32>(in.pos.xy, 1.0); // Clip-space position to view-space

  return vec4<f32>(lighting); // Visualize direction

    /*let rayOrigin = 0.0; // Ray starts from the camera
    let cubeMin = vec3<f32>(-cubeBounds.x, -cubeBounds.y, -cubeBounds.z);
    let cubeMax = vec3<f32>(cubeBounds.x, cubeBounds.y, cubeBounds.z);

    // Find where the ray enters and exits the cube
    let t = intersectCube(rayOrigin, rayDir, cubeMin, cubeMax);
    if (t.x > t.y || t.y < 0.0) {
        discard; // No intersection with cube
    }

    let stepSize = 0.1;
    let maxSteps = 128;
    var accumulatedDensity = 0.0;
    var rayPos = rayOrigin + rayDir * t.x; // Start marching from entry point

    for (var i = 0; i < maxSteps; i++) {
        if (t.x + f32(i) * stepSize > t.y) {
            break; // Stop if past exit point
        }

        let x = u32(clamp((rayPos.x + 1.0) * f32(gridSize) * 0.5, 0.0, f32(gridSize - 1)));
        let y = u32(clamp((rayPos.y + 1.0) * f32(gridSize) * 0.5, 0.0, f32(gridSize - 1)));
        let z = u32(clamp((rayPos.z + 1.0) * f32(gridSize) * 0.5, 0.0, f32(gridSize - 1)));

        let idx = z * gridSize * gridSize + y * gridSize + x;
        accumulatedDensity += density[idx] * stepSize;

        if (accumulatedDensity > 1.0) {
            break;
        }
        rayPos += rayDir * stepSize; // Advance ray
    }

    return vec4<f32>(accumulatedDensity, accumulatedDensity, accumulatedDensity, 1.0);*/
}

/* This is just the output of my vertex shader
struct VertexOutput {
  @builtin(position) position : vec4<f32>, // Where to map vertices in screen
  @location(0) fragUV : vec2<f32>, // UVW coords for fragment shader
  @location(1) fragNormal: vec3<f32>,
};

@group(0) @binding(0) var<uniform> viewMatrix : mat4x4<f32>;
@group(0) @binding(1) var<uniform> projMatrix : mat4x4<f32>;

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec3<f32>, 36>(
         vec3<f32>(-1.0, -1.0,  1.0), vec3<f32>( 1.0, -1.0,  1.0), vec3<f32>(-1.0,  1.0,  1.0),
        vec3<f32>(-1.0,  1.0,  1.0), vec3<f32>( 1.0, -1.0,  1.0), vec3<f32>( 1.0,  1.0,  1.0),

        // Back face
        vec3<f32>( 1.0, -1.0, -1.0), vec3<f32>(-1.0, -1.0, -1.0), vec3<f32>( 1.0,  1.0, -1.0),
        vec3<f32>( 1.0,  1.0, -1.0), vec3<f32>(-1.0, -1.0, -1.0), vec3<f32>(-1.0,  1.0, -1.0),

        // Left face
        vec3<f32>(-1.0, -1.0, -1.0), vec3<f32>(-1.0, -1.0,  1.0), vec3<f32>(-1.0,  1.0, -1.0),
        vec3<f32>(-1.0,  1.0, -1.0), vec3<f32>(-1.0, -1.0,  1.0), vec3<f32>(-1.0,  1.0,  1.0),

        // Right face
        vec3<f32>(1.0, -1.0,  1.0), vec3<f32>(1.0, -1.0, -1.0), vec3<f32>(1.0,  1.0,  1.0),
        vec3<f32>(1.0,  1.0,  1.0), vec3<f32>(1.0, -1.0, -1.0), vec3<f32>(1.0,  1.0, -1.0),

        // Top face
        vec3<f32>(-1.0, 1.0,  1.0), vec3<f32>( 1.0, 1.0,  1.0), vec3<f32>(-1.0, 1.0, -1.0),
        vec3<f32>(-1.0, 1.0, -1.0), vec3<f32>( 1.0, 1.0,  1.0), vec3<f32>( 1.0, 1.0, -1.0),

        // Bottom face
        vec3<f32>(-1.0, -1.0, -1.0), vec3<f32>( 1.0, -1.0, -1.0), vec3<f32>(-1.0, -1.0,  1.0),
        vec3<f32>(-1.0, -1.0,  1.0), vec3<f32>( 1.0, -1.0, -1.0), vec3<f32>( 1.0, -1.0,  1.0)
    
    );


    var pos = vec4<f32>(positions[vertexIndex], 1.0);
    pos = projMatrix * viewMatrix * pos; // Apply transformations
    //pos = projMatrix * viewMatrix;

    var output: VertexOutput;
    output.position = pos;
    output.fragUV = (positions[vertexIndex].xy + vec2<f32>(1.0)) * 0.5;
    output.fragNormal = normalize(positions[vertexIndex]);
    return output;
}

@group(0) @binding(2) var<storage, read> density : array<f32>;
@group(0) @binding(3) var<storage, read> velocity : array<vec3<f32>>;
@group(0) @binding(4) var<storage, read> pressure : array<f32>;
@group(0) @binding(5) var<storage, read> divergence : array<f32>;
@group(0) @binding(6) var<uniform> gridSize : u32;
@group(0) @binding(7) var<uniform>  renderMode : u32;

@fragment
fn fragment_main(@location(0) fragUV: vec2<f32>, @location(1) fragNormal: vec3<f32>) -> @location(0) vec4<f32> {
  let x = u32(fragUV.x * f32(gridSize));
  let y = u32(fragUV.y * f32(gridSize));

  if(renderMode == 0){
    var accumulatedDensity = 0.0;
    for (var z: u32 = 0; z < gridSize; z++){
      let idx = z * gridSize * gridSize + y * gridSize + x;
      accumulatedDensity += density[idx];
      if(accumulatedDensity >= 1.0){
        accumulatedDensity = 1.0;
        break;
      }
    }
    return vec4<f32>(accumulatedDensity, accumulatedDensity, accumulatedDensity, 1.0);
  }
  else if(renderMode == 1){
    var accumulatedVelocity = vec3<f32>(0.0);
    for (var z: u32 = 0; z < gridSize; z++){
      let idy = z * gridSize * gridSize + y * gridSize + x;
      accumulatedVelocity += velocity[idy];
    }
    if(accumulatedVelocity[0] < 0){
      return vec4<f32>(abs(accumulatedVelocity[0]) * 100.0, accumulatedVelocity[2] * 100.0, 0, 1.0);
    }
    else{
      return vec4<f32>(0, accumulatedVelocity[2] * 100.0, accumulatedVelocity[0] * 100.0, 1.0);
    }
  }
  else if(renderMode == 2){
    var accumulatedPressure = 0.0;
    for (var z: u32 = 0; z < gridSize; z++){
      let idx = z * gridSize * gridSize + y * gridSize + x;
      accumulatedPressure += pressure[idx];
      if(accumulatedPressure >= 1.0){
        accumulatedPressure = 1.0;
        break;
      }
    }
    if(accumulatedPressure < 0){
      return vec4<f32>(abs(accumulatedPressure) * 40.0, 0,0, 1.0);
    }
    else{
      return vec4<f32>(0, 0,accumulatedPressure * 40.0, 1.0);
    }
  }
  else{
    var accumulatedDivergence = 0.0;
    for (var z: u32 = 0; z < gridSize; z++){
      let idx = z * gridSize * gridSize + y * gridSize + x;
      accumulatedDivergence += divergence[idx];
      if(accumulatedDivergence >= 1.0){
        accumulatedDivergence = 1.0;
        break;
      }
    }
    if(accumulatedDivergence < 0){
      return vec4<f32>(abs(accumulatedDivergence) * 40.0, 0,0, 1.0);
    }
    else{
      return vec4<f32>(0, 0,accumulatedDivergence * 40.0, 1.0);
    }
  }
}*/