import { ComputeShader,borderControl } from "../utils.js";

export function velocityAdvectionShader(device, computeShaders) {
    computeShaders.velocity = new ComputeShader("velocity", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read> velocity_in : array<vec3<f32>>;
    @group(0) @binding(1) var<storage, read_write> velocity_out : array<vec3<f32>>;
    @group(0) @binding(2) var<uniform> gridSize : u32;
    @group(0) @binding(3) var<uniform> dt : f32;

    ${borderControl("velocity_in", "velocity_out", "vec3<f32>(0,0,0)")}

    fn self_advection(idx:u32, x: f32, y: f32, z: f32) -> vec3<f32> {
        let vel: vec3<f32> = velocity_in[idx];
        let prevPos: vec3<f32> = vec3<f32>(x, y, z) - vel * dt;
        return vec3<f32>(sample_velocity_at(prevPos,0),sample_velocity_at(prevPos,1),sample_velocity_at(prevPos,2));
    }

    fn sample_velocity_at(pos: vec3<f32>, component: i32) -> f32 {
        var x = pos.x;
        var y = pos.y;
        var z = pos.z;
        let gs = gridSize - 1;
        let gridSize2 = gridSize * gridSize;
    
        let x1 = clamp(u32(floor(x)),0,gs);
        let y1 = clamp(u32(floor(y)),0,gs);
        let z1 = clamp(u32(floor(z)),0,gs);
        let x2 = clamp(u32(x1 + 1),0,gs);
        let y2 = clamp(u32(y1 + 1),0,gs);
        let z2 = clamp(u32(z1 + 1),0,gs);
    
        let fbl = velocity_in[x1 + y1 * gridSize + z2 * gridSize2][component];
        let fbr = velocity_in[x2 + y1 * gridSize + z2 * gridSize2][component];
        let ftl = velocity_in[x1 + y2 * gridSize + z2 * gridSize2][component];
        let ftr = velocity_in[x2 + y2 * gridSize + z2 * gridSize2][component];
        let bbl = velocity_in[x1 + y1 * gridSize + z1 * gridSize2][component];
        let bbr = velocity_in[x2 + y1 * gridSize + z1 * gridSize2][component];
        let btl = velocity_in[x1 + y2 * gridSize + z1 * gridSize2][component];
        let btr = velocity_in[x2 + y2 * gridSize + z1 * gridSize2][component];
    
        let xMod = fract(x); // Only keeps the fraction (decimalke)
        let yMod = fract(y);
        let zMod = fract(z);
        
        //let bilerp = mix(mix(bl, br, xMod), mix(tl, tr, xMod), yMod);
        let bilerp = mix(mix(mix(bbl,bbr,xMod), mix(btl,btr,xMod),yMod),
                        mix(mix(fbl,fbr,xMod), mix(ftl,ftr,xMod),yMod), zMod);
        return bilerp;
    }

    @compute @workgroup_size(4,4,4)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
        let x: u32 = global_id.x;
        let y: u32 = global_id.y;
        let z: u32 = global_id.z;

        var result: vec3<f32> = vec3<f32>(0.0,0.0,0.0);
        let idx: u32 = x + y * gridSize + z * gridSize * gridSize;
        let advectedVelocity: vec3<f32> = self_advection(idx, f32(x), f32(y), f32(z));

        velocity_out[idx] = advectedVelocity * 1.0; //* 0.999;

        borderControl(1, x, y, z, idx);
    }`);
}