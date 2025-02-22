import { ComputeShader, borderControl } from "../utils.js";

export function advectShader(device, computeShaders) {
    computeShaders.advect = new ComputeShader("advect", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read> velocity_in : array<vec2<f32>>;
    @group(0) @binding(1) var<storage, read> density_in : array<f32>;
    @group(0) @binding(2) var<storage, read_write> density_out : array<f32>;
    @group(0) @binding(3) var<uniform> gridSize : u32;
    @group(0) @binding(4) var<uniform> dt : f32;

    ${borderControl("density_in","density_out","0")}

    fn sample_density_at(pos: vec2<f32>) -> f32 {
        // Bilinear interpolation
        var x = pos.x;
        var y = pos.y;
        let gs = gridSize - 1;
    
        let x1 = clamp(u32(floor(x)),0,gs);
        let y1 = clamp(u32(floor(y)),0,gs);
        let x2 = clamp(u32(x1 + 1),0,gs);
        let y2 = clamp(u32(y1 + 1),0,gs);
    
        let bl = density_in[x1 + y1 * gridSize];
        let br = density_in[x2 + y1 * gridSize];
        let tl = density_in[x1 + y2 * gridSize];
        let tr = density_in[x2 + y2 * gridSize];
    
        let xMod = fract(x);
        let yMod = fract(y);
        
        let bilerp = mix(mix(bl, br, xMod), mix(tl, tr, xMod), yMod);
        return bilerp;
    }
    
    fn advect(idx: u32, x: f32, y: f32) -> f32 {
        // Advection is computed implicitly, meaning we take the velocities of the closest
        // 4 points from previous position and apply it to the quantity, in our case density.
        let vel: vec2<f32> = velocity_in[idx];
        let prevPos: vec2<f32> = vec2<f32>(x, y) - vel * dt; // * rdx?
        return sample_density_at(prevPos);
    }

    @compute @workgroup_size(16, 16)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
        let x: u32 = global_id.x;
        let y: u32 = global_id.y;

        var result: f32 = 0.0;
        let idx: u32 = x + y * gridSize;
        let advectedDensity: f32 = advect(idx, f32(x), f32(y));
        result = advectedDensity * 0.999;

        density_out[idx] = result;

        borderControl(0, x, y, idx);
    }`);
}