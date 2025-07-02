import { ComputeShader } from "../utils.js";

export function renderingShader(device, computeShaders) {
    computeShaders.render = new ComputeShader("render", device, /*wgsl*/`

    struct ModelUniforms {
        modelMatrix: mat4x4f,
        inverseViewMatrix: mat4x4f,
        inverseProjectionMatrix: mat4x4f,
    }

    @group(0) @binding(0) var texture: texture_storage_2d<rgba8unorm, write>;
    @group(0) @binding(1) var readTexture: texture_storage_2d<rgba8unorm, read>;
    @group(0) @binding(2) var smokeTexture: texture_3d<f32>;
    @group(0) @binding(3) var smokeSampler: sampler;
    @group(0) @binding(4) var temperatureTexture: texture_3d<f32>;
    @group(0) @binding(5) var temperatureSampler: sampler;
    @group(1) @binding(0) var<uniform> uStepSize: f32;
    @group(1) @binding(1) var<uniform> uLightStepSize: f32;
    @group(1) @binding(2) var<uniform> uAbsorption: f32; // How much density gets absorbed when sampled
    @group(1) @binding(3) var<uniform> uScattering: f32; // How much light is scattered away from our view
    @group(1) @binding(4) var<uniform> uPhase: f32;
    @group(1) @binding(5) var<uniform> cameraPosition: vec3<f32>;
    @group(2) @binding(0) var<uniform> uMatrices: ModelUniforms;


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
        let nothing = uLightStepSize; // Just to avoid unused variable warning
        let index = globalId.xy;
        let size = textureDimensions(texture);
        if (index.x >= size.x || index.y >= size.y) {
            return;
        }

        // Cube transform
        let cube_bounds = getWorldBoundingBox();
        let cube_min = cube_bounds[0];
        let cube_max = cube_bounds[1];

        let ndcx = 2.0 * ((f32(index.x) + 0.5) / f32(size.x) - 0.5) * PI/4.0 * (f32(size.x) / f32(size.y));
        let ndcy = 1.0 - 2.0 * ((f32(index.y) + 0.5) / f32(size.y)) * PI/4.0;
        let clipPos = vec4<f32>(ndcx, ndcy, -1.0, 1.0);
        let viewPos = uMatrices.inverseProjectionMatrix * clipPos;
        var worldPos = uMatrices.inverseViewMatrix * vec4<f32>(clipPos.xyz, 1.0);
        worldPos = worldPos / worldPos.w;

        let ray_dir = normalize(worldPos.xyz - cameraPosition);

        // Intersect the ray with the cube
        let t_bounds = intersectCube(cameraPosition, ray_dir, cube_min, cube_max);
        var t = max(t_bounds.x, 0.0);
        let t_end = t_bounds.y;
        var in_box = false;

        // Ray marching
        let extinction = uAbsorption + uScattering;
        let scatter = vec3(1.0);
        let li_color = vec3(1.0);
        let li_pos = vec3(30.0,30.0,-30.0);
        var transmittance = 1.0;
        var final_color = textureLoad(readTexture, vec2i(i32(index.x), i32(index.y))).xyz;
        let offset = hash(f32(index.x) + f32(index.y) * f32(size.x)); // Random offset for jittering
        t += uStepSize * offset * 0.01;
        if (t < t_end){
            final_color = vec3(0.0);
            in_box = true;
        }
        while (t < t_end) {
            let pos = cameraPosition + ray_dir * t;
            let density = sample_texture(pos, cube_min, cube_max, smokeTexture, smokeSampler);
            let temperature = sample_texture(pos, cube_min, cube_max, temperatureTexture, temperatureSampler);

            let absorption = uAbsorption * density;
            transmittance *= exp(-uStepSize * absorption * extinction);
            
            let li_dir = normalize(li_pos - pos);
            var li_density = 0.0;
            let li_end = intersectCube(pos, li_dir, cube_min, cube_max);
            if (li_end.y > 0.0 && density > 0.0) {
                let numSteps = 50;
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
                let ph = uPhase;
                let li_transmittance = exp(-li_density * liStepSize * extinction);
                final_color += scatter *                                // light color
                            li_transmittance *                          // light ray transmission value
                            henyey_greenstein(uPhase, cos_theta) * 5 *  // phase function
                            uScattering *                               // scattering coefficient
                            transmittance *                             // ray current transmission value
                            uStepSize *
                            temperature_to_color(temperature) *         // temperature color
                            density;                                    // density
            }

            if (transmittance < 0.01) { // Roulette
                if (hash((transmittance * 10.0) + f32(index.x) + f32(index.y) * f32(size.x)) > 0.5){
                    break;
                }
            }
            t += uStepSize;
        }
        if (in_box){
            final_color += (transmittance * textureLoad(readTexture, vec2i(i32(index.x), i32(index.y))).xyz);
        }
        let color = vec4<f32>(final_color, 1.0 - transmittance);
        textureStore(texture, index, color);
    }`);
}
