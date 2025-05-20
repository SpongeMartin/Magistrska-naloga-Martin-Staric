import { ComputeShader } from "../utils.js";

export function debugShader(device, computeShaders) {
    computeShaders.debug = new ComputeShader("debug", device, /*wgsl*/`

    struct ModelUniforms {
        modelMatrix: mat4x4f,
        inverseViewMatrix: mat4x4f,
        inverseProjectionMatrix: mat4x4f,
    }

    @group(0) @binding(0) var texture: texture_storage_2d<rgba8unorm, write>;
    @group(0) @binding(1) var readTexture: texture_storage_2d<rgba8unorm, read>;
    @group(0) @binding(2) var pressureTexture: texture_3d<f32>;
    @group(0) @binding(3) var velocityTexture: texture_3d<f32>;
    @group(0) @binding(4) var divergenceTexture: texture_3d<f32>;
    @group(1) @binding(0) var pressureSampler: sampler;
    @group(1) @binding(1) var velocitySampler: sampler;
    @group(1) @binding(2) var divergenceSampler: sampler;
    @group(2) @binding(0) var<uniform> uMatrices: ModelUniforms;
    @group(3) @binding(0) var<uniform> cameraPosition: vec3<f32>;
    @group(3) @binding(1) var<uniform> renderMode : u32;
    @group(3) @binding(2) var<uniform> uStepSize : f32;

    const PI: f32 = radians(180);

    fn lol(tex_coords: vec3<f32>, index: vec2<u32>){
        let a = textureLoad(readTexture, vec2i(i32(index.x), i32(index.y))).xyz;
        let c = textureSampleLevel(pressureTexture, pressureSampler, tex_coords, 0.0);
        let d = textureSampleLevel(velocityTexture,velocitySampler,tex_coords,0.0);
        let e = textureSampleLevel(divergenceTexture,divergenceSampler,tex_coords,0.0);
        let i = uMatrices;
        let j = cameraPosition;
        let k = renderMode;
        let l = uStepSize;
    }

    fn hash(x: f32) -> f32 {
        let sin_val = sin(x * 12.9898);
        let hashed = sin_val * 43758.5453;
        return fract(hashed);
    }

    fn intersectCube(ray_origin: vec3<f32>, ray_dir: vec3<f32>, cube_min: vec3<f32>, cube_max: vec3<f32>) -> vec2<f32> {
        let t_min = (cube_min - ray_origin) / ray_dir;
        let t_max = (cube_max - ray_origin) / ray_dir;
        let t1 = min(t_min, t_max);
        let t2 = max(t_min, t_max);
        let tNear = max(max(t1.x, t1.y), t1.z);
        let tFar = min(min(t2.x, t2.y), t2.z);

        if (tNear > tFar || tFar < 0.0) {
            return vec2<f32>(-1.0, -1.0);
        }
        return vec2<f32>(tNear, tFar);
    }

    fn sample_texture(pos: vec3<f32>, cube_min: vec3<f32>, cube_max: vec3<f32>, texture: texture_3d<f32>, sampler: sampler) -> f32{
        // Convert from world-space to texture space [0..1]
        let tex_coords = (pos - cube_min) / (cube_max - cube_min);
        return textureSampleLevel(texture, sampler, tex_coords, 0.0).r;
    }

    fn sample_velocity(pos: vec3<f32>, cube_min: vec3<f32>, cube_max: vec3<f32>, texture: texture_3d<f32>, sampler: sampler) -> vec3<f32>{
        // Convert from world-space to texture space [0..1]
        let tex_coords = (pos - cube_min) / (cube_max - cube_min);
        return textureSampleLevel(texture, sampler, tex_coords, 0.0).rgb;
    }

    fn getWorldBoundingBox() -> array<vec3<f32>, 2> {
        let corners = array<vec3<f32>, 8>(
            vec3<f32>(-1.0, -1.0, -1.0),
            vec3<f32>(-1.0, -1.0,  1.0),
            vec3<f32>(-1.0,  1.0, -1.0),
            vec3<f32>(-1.0,  1.0,  1.0),
            vec3<f32>( 1.0, -1.0, -1.0),
            vec3<f32>( 1.0, -1.0,  1.0),
            vec3<f32>( 1.0,  1.0, -1.0),
            vec3<f32>( 1.0,  1.0,  1.0),
        );
    
        var minCorner = vec3<f32>(1000.0);
        var maxCorner = vec3<f32>(-1000.0);
    
        for (var i = 0u; i < 8u; i = i + 1u) {
            let worldPos = (uMatrices.modelMatrix * vec4<f32>(corners[i], 1.0)).xyz;
            minCorner = min(minCorner, worldPos);
            maxCorner = max(maxCorner, worldPos);
        }
    
        return array<vec3<f32>, 2>(minCorner, maxCorner);
    }

    @compute @workgroup_size(8, 8)
    fn compute(@builtin(global_invocation_id) globalId: vec3u) {
        let index = globalId.xy;
        let size = textureDimensions(texture);
        if (index.x >= size.x || index.y >= size.y) {
            return;
        }

        let cube_bounds = getWorldBoundingBox();
        let cube_min = cube_bounds[0];
        let cube_max = cube_bounds[1];

        let uv = (vec2<f32>(index) + vec2<f32>(0.5)) / vec2<f32>(size);
        var ndc = uv * 2.0 - vec2<f32>(1.0); // * image aspect ratio for x coordinate later when fullscreen
        ndc.y = 1.0 - 1.0 * ndc.y;
        ndc = ndc * PI / 4.0;

        let clip = vec4<f32>(ndc, -1.0, 1.0);

        let view = uMatrices.inverseProjectionMatrix * clip;
        let viewNDC = view.xyz / view.w;

        let world = (uMatrices.inverseViewMatrix * vec4<f32>(viewNDC, 1.0)).xyz;

        let ray_dir = normalize(world - cameraPosition);
        

        // Intersect the ray with the cube
        let t_bounds = intersectCube(cameraPosition, ray_dir, cube_min, cube_max);
        var t = max(t_bounds.x, 0.0);
        let t_end = t_bounds.y;
        var in_box = false;

        // Ray marching
        let scatter = vec3(1.0);
        var transmittance = 1.0;
        var final_color = textureLoad(readTexture, vec2i(i32(index.x), i32(index.y))).xyz + vec3(0.1);

        if (t < t_end){
            final_color = vec3(0.0);
            in_box = true;
        }
        while (t < t_end) {
            let pos = cameraPosition + ray_dir * t;
            var measure = 0.0;
            var density = vec3<f32>(0.0);
            if (renderMode == 0) {
                measure = sample_texture(pos, cube_min, cube_max, pressureTexture, pressureSampler);
                if (measure > 0.0) {
                    density = vec3<f32>(measure, 0.0, 0.0);
                } else {
                    density = vec3<f32>(0.0, 0.0, measure);
                }
            } else if (renderMode == 1) {
                density = sample_velocity(pos, cube_min, cube_max, velocityTexture, velocitySampler);
                measure = density.x;
            } else if (renderMode == 2) {
                measure = sample_texture(pos, cube_min, cube_max, divergenceTexture, divergenceSampler);
                if (measure > 0.0) {
                    density = vec3<f32>(measure, 0.0, 0.0);
                } else {
                    density = vec3<f32>(0.0, 0.0, measure);
                }
            } else if(renderMode == 3) {
                if (index.x % 1 == 0u || index.y % 1 == 0u) {
                    let debug_color = 1.0;
                    textureStore(texture, index, vec4<f32>(1.0, 0.0, 0.0, 1.0));
                }

                if (index.x % 64 == 0u || index.y % 64 == 0u) {
                    textureStore(texture, index, vec4<f32>(1.0, 1.0, 1.0, 1.0)); // white grid line
                }
            }

            let absorption = 0.5 * measure;
            let extinction = 0.5 + 15.5;

            transmittance *= exp(-uStepSize * measure);
            
            if (measure > 0.0) {
                final_color += transmittance * uStepSize * density;
            }
    
            if (transmittance < 0.01) {
                break;
            }
            t += uStepSize;
        }
        if (in_box && renderMode != 3) {
            final_color += (transmittance * textureLoad(readTexture, vec2i(i32(index.x), i32(index.y))).xyz);
            let color = vec4<f32>(final_color, 1.0 - transmittance);
            textureStore(texture, index, color);
        }

    }`);
}
