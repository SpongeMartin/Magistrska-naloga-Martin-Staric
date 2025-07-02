import { ComputeShader, borderControl } from "../utils.js";

export function advectShader(device, computeShaders) {
    computeShaders.advect = new ComputeShader("advect", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read> velocity_in : array<vec3<f32>>;
    @group(0) @binding(1) var<storage, read> density_in : array<f32>;
    @group(0) @binding(2) var<storage, read_write> density_out : array<f32>;
    @group(0) @binding(3) var<uniform> gridSize : u32;
    @group(0) @binding(4) var<uniform> dt : f32;
    @group(0) @binding(5) var<uniform> decay : f32;

    ${borderControl("density_in","density_out","0")}

    fn sample_density_at(pos: vec3<f32>) -> f32 {
        // Bilinear interpolation
        var x = pos.x;
        var y = pos.y;
        var z = pos.z;
        let gs = gridSize;
        let gs2 = gs * gs;
    
        let x1 = clamp(u32(floor(x)),0,gs);
        let y1 = clamp(u32(floor(y)),0,gs);
        let z1 = clamp(u32(floor(z)),0,gs);
        let x2 = clamp(u32(x1 + 1),0,gs);
        let y2 = clamp(u32(y1 + 1),0,gs);
        let z2 = clamp(u32(z1 + 1),0,gs);
    
        let fbl = density_in[x1 + y1 * gs + z1 * gs2];
        let fbr = density_in[x2 + y1 * gs + z1 * gs2];
        let ftl = density_in[x1 + y2 * gs + z1 * gs2];
        let ftr = density_in[x2 + y2 * gs + z1 * gs2];
        let bbl = density_in[x1 + y1 * gs + z2 * gs2];
        let bbr = density_in[x2 + y1 * gs + z2 * gs2];
        let btl = density_in[x1 + y2 * gs + z2 * gs2];
        let btr = density_in[x2 + y2 * gs + z2 * gs2];
    
        let xMod = fract(x); // Only keeps the fraction (decimalke)
        let yMod = fract(y);
        let zMod = fract(z);
        
        //let bilerp = mix(mix(bl, br, xMod), mix(tl, tr, xMod), yMod);
        let bilerp = mix(mix(mix(fbl,fbr,xMod), mix(ftl,ftr,xMod),yMod),
                        mix(mix(bbl,bbr,xMod), mix(btl,btr,xMod),yMod), zMod);
        return bilerp;
    }
    
    fn advect(idx: u32, x: f32, y: f32, z:f32) -> f32 {
        // Advection is computed implicitly, meaning we take the velocities of the closest
        // 4 points from previous position and apply it to the quantity, in our case density.
        let vel: vec3<f32> = velocity_in[idx];
        let prevPos: vec3<f32> = vec3<f32>(x, y, z) - vel * dt; // * rdx?
        return sample_density_at(prevPos);
    }

    @compute @workgroup_size(4,4,4)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
        let x: u32 = global_id.x;
        let y: u32 = global_id.y;
        let z: u32 = global_id.z;

        var result: f32 = 0.0;
        let idx: u32 = x + y * gridSize + z * gridSize * gridSize;
        let advectedDensity: f32 = advect(idx, f32(x), f32(y), f32(z));
        result = advectedDensity * decay;

        density_out[idx] = result;

        borderControl(1, x, y, z, idx);
    }`);
}