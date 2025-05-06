import { ComputeShader } from "../utils.js";

export function renderingShader(device, computeShaders, layout) {
    computeShaders.render = new ComputeShader("render", device, /*wgsl*/`
    @group(0) @binding(0) var texture: texture_storage_2d<rgba8unorm, write>;
    @group(0) @binding(1) var readTexture: texture_storage_2d<rgba8unorm, read>;
    @group(0) @binding(2) var smokeTexture: texture_3d<f32>;
    @group(0) @binding(3) var smokeSampler: sampler;
    @group(0) @binding(4) var temperatureTexture: texture_3d<f32>;
    @group(0) @binding(5) var temperatureSampler: sampler;
    @group(0) @binding(6) var<uniform> uStepSize: f32; // Replace with marching through each block?
    @group(0) @binding(7) var<uniform> uLightStepSize: f32;
    @group(0) @binding(8) var<uniform> uAbsorption: f32; // How much density gets absorbed when sampled
    @group(0) @binding(9) var<uniform> uScattering: f32; // How much light is scattered away from our view
    @group(0) @binding(10) var<uniform> uPhase: f32;
    //@group(0) @binding(2) var<uniform> renderMode : u32;

    const PI: f32 = radians(180);

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

    fn henyey_greenstein(g: f32, cos_theta: f32) -> f32{
        let denom = max(1e-4, 1.0 + g * g - 2.0 * g * cos_theta);
        return 1.0 / (4.0 * PI) * (1.0 - g * g) / (denom * sqrt(denom));
    }

    fn temperature_to_color(temperature: f32) -> vec3<f32> {
        let minTemp = 0.0;
        let maxTemp = 1.0;
        
        let t = clamp((temperature - minTemp) / (maxTemp - minTemp), 0.0, 1.0);

        let color = mix(vec3(1.0, 1.0, 1.0), vec3(3.5, 0.8, 0.0), t);  // White to red
        return color;
    }

    @compute @workgroup_size(8, 8)
    fn compute(@builtin(global_invocation_id) globalId: vec3u) {
        let nothing = uLightStepSize;
        let index = globalId.xy;
        let size = textureDimensions(texture);
        if (index.x >= size.x || index.y >= size.y) {
            return;
        }

        let camera_origin = vec3(0.0);
        let cube_min = vec3(-1.0,-1.0,-2.0);
        let cube_max = vec3(1.0,1.0,-3.0);
        let extinction = uAbsorption + uScattering;
        let scatter = vec3(1.0);
        let li_color = vec3(1.0);
        let li_pos = vec3(3.0,-3.0,-3.0);

        let uv = (vec2<f32>(index) / vec2<f32>(size)) * 2.0 - vec2<f32>(1.0);
        
        // Compute ray direction from camera
        let ray_dir = normalize(vec3<f32>(uv.x, uv.y, -1.0));

        let t_bounds = intersectCube(camera_origin, ray_dir, cube_min, cube_max);

        var t = max(t_bounds.x, 0.0);
        let t_end = t_bounds.y;
        var transmittance = 1.0;
        var final_color = textureLoad(readTexture, vec2i(i32(index.x), i32(index.y))).xyz;
        
        let offset = hash(f32(index.x) + f32(index.y) * f32(size.x));
        t += uStepSize * offset;

        while (t < t_end) {
            let pos = camera_origin + ray_dir * t;
            let li_dir = normalize(li_pos - pos);
            var li_density = 0.0;
            let li_end = intersectCube(pos, li_dir, cube_min, cube_max);
            let density = sample_texture(pos, cube_min, cube_max, smokeTexture, smokeSampler);
            let temperature = sample_texture(pos, cube_min, cube_max, temperatureTexture, temperatureSampler);

            let absorption = uAbsorption * density;
            transmittance *= exp(-uStepSize * absorption * extinction);
            
            if (li_end.y > 0.0 && density > 0.0) {
                let numSteps = 16;
                let cube_exit = pos + li_dir * li_end.y;
                let liStepSize = distance(pos, cube_exit) / f32(numSteps);
    
                for (var i = 0; i < numSteps; i++) {
                    let liPos = pos + li_dir * liStepSize * f32(i);
                    li_density += sample_texture(liPos, cube_min, cube_max, smokeTexture, smokeSampler);
                    if (li_density > 1.0) {
                        break;
                    }
                }

                let cos_theta = dot(ray_dir, li_dir);
                let li_transmittance = exp(-li_density * liStepSize * extinction);
                final_color += scatter *            // light color
                            li_transmittance *      // light ray transmission value
                            henyey_greenstein(uPhase, cos_theta) * 7 * // phase function
                            uScattering *           // scattering coefficient
                            transmittance *         // ray current transmission value
                            uStepSize *
                            temperature_to_color(temperature) *
                            density;
            }
    
            if (transmittance < 0.01) { // Roulette
                if (hash((transmittance * 10.0) + f32(index.x) + f32(index.y) * f32(size.x)) > 0.25){
                    break;
                }
            }
            t += uStepSize;
        }
        let color = vec4<f32>(final_color, 1.0 - transmittance);
        textureStore(texture, index, color);
    }`, device.createPipelineLayout({ bindGroupLayouts: [layout] }));
}
