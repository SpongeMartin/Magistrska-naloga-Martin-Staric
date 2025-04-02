import { ComputeShader } from "../utils.js";

export function renderingShader(device, computeShaders) {
    computeShaders.render = new ComputeShader("render", device, /*wgsl*/`
    @group(0) @binding(0) var texture: texture_storage_2d<rgba8unorm, write>;
    @group(0) @binding(1) var densityTexture: texture_3d<f32>;
    //@group(0) @binding(2) var<uniform> renderMode : u32;

    fn intersectCube(ray_origin: vec3<f32>, ray_dir: vec3<f32>, cube_min: vec3<f32>, cube_max: vec3<f32>) -> vec2<f32> {
        let t_min = (cube_min - ray_origin) / ray_dir;
        let t_max = (cube_max - ray_origin) / ray_dir;
        let t1 = min(t_min, t_max);
        let t2 = max(t_min, t_max);
        let tNear = max(max(t1.x, t1.y), t1.z);
        let tFar = min(min(t2.x, t2.y), t2.z);

        if (tNear > tFar || tFar < 0.0) {
            return vec2<f32>(-1.0, -1.0);  // No intersection
        }
        return vec2<f32>(tNear, tFar);
    }

    @compute @workgroup_size(8, 8)
    fn compute(@builtin(global_invocation_id) globalId: vec3u) {
        let index = globalId.xy;
        let size = textureDimensions(texture);
        if (index.x >= size.x || index.y >= size.y) {
            return;
        }

        let camera_origin = vec3(0.0);
        let cube_min = vec3(-1.0,-1.0,-1.0);
        let cube_max = vec3(1.0,1.0,-3.0);
        let absorption_coefficient = 0.2;
        let scatter = vec3(0.3);

        let uv = (vec2<f32>(index) / vec2<f32>(size)) * 2.0 - vec2<f32>(1.0);
        
        // Compute ray direction from camera
        let ray_dir = normalize(vec3<f32>(uv.x, uv.y, -1.0));

        let t_bounds = intersectCube(camera_origin, ray_dir, cube_min, cube_max);

        let background_color = vec3<f32>(0.572, 0.772, 0.921);
        var color = background_color;

        if (t_bounds.x >= 0.0 && t_bounds.y >= 0.0) {
            let p1 = camera_origin + ray_dir * t_bounds.x;
            let p2 = camera_origin + ray_dir * t_bounds.y;

            var accumulated_transmission = 1.0;
            let step_size = 0.05;
            var t = t_bounds.x;

            while (t < t_bounds.y) {
                let ray_pos = camera_origin + ray_dir * t;

                // Map the ray position to texture coordinates
                let tex_coords = (ray_pos - cube_min) / (cube_max - cube_min);  // Normalize to [0, 1]
                let tex_size = textureDimensions(densityTexture);
                let tex_index = vec3<i32>(tex_coords * vec3<f32>(tex_size));

                let density = textureLoad(densityTexture, tex_index, 0).r * 5; // Texture sample menjaj


                let attenuation = exp(-density * absorption_coefficient * step_size);
                accumulated_transmission *= attenuation;
                color = color * accumulated_transmission + scatter * (1.0 - accumulated_transmission);

                t += step_size;

                if (accumulated_transmission < 0.01) {
                    break;
                }
            }
        }

        textureStore(texture, index, vec4<f32>(color, 1.0));
    }`);
}
