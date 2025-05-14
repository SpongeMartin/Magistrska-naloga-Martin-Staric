import { ComputeShader, borderControl } from "../utils.js";

export function velocityAdvectionShader(device, computeShaders) {
    computeShaders.velocity = new ComputeShader("velocity", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read> velocity_in : array<vec3<f32>>;
    @group(0) @binding(1) var<storage, read_write> velocity_out : array<vec3<f32>>;
    @group(0) @binding(2) var<storage, read_write> temperature_in : array<f32>;
    @group(0) @binding(3) var<uniform> gridSize : u32;
    @group(0) @binding(4) var<uniform> dt : f32;

    ${borderControl("velocity_in", "velocity_out", "vec3<f32>(0,0,0)")}

    fn self_advection(idx:u32, x: f32, y: f32, z: f32) -> vec3<f32> {
        let vel: vec3<f32> = velocity_in[idx];
        var prevPos: vec3<f32> = vec3<f32>(x, y, z) - vel * dt;
        let prevTemperature = sample_temperature_at(prevPos);

        let temperatureGradient = vec3<f32>(0.0, -1.0, 0.0); // Fix renderer so it works in z direction
        let buoyancy_strength = 0.8;
        let buoyancyForce = buoyancy_strength * prevTemperature * temperatureGradient;

        return vec3<f32>(sample_velocity_at(prevPos,0),sample_velocity_at(prevPos,1),sample_velocity_at(prevPos,2)) + buoyancyForce;
    }

    fn sample_temperature_at(pos: vec3<f32>) -> f32 {
        var x = pos.x;
        var y = pos.y;
        var z = pos.z;
        let gs = gridSize;
        let gridSize2 = gridSize * gridSize;
    
        let x1 = clamp(u32(floor(x)), 0, gs);
        let y1 = clamp(u32(floor(y)), 0, gs);
        let z1 = clamp(u32(floor(z)), 0, gs);
        let x2 = clamp(u32(x1 + 1), 0, gs);
        let y2 = clamp(u32(y1 + 1), 0, gs);
        let z2 = clamp(u32(z1 + 1), 0, gs);
    
        let fbl = temperature_in[x1 + y1 * gs + z2 * gridSize2];
        let fbr = temperature_in[x2 + y1 * gs + z2 * gridSize2];
        let ftl = temperature_in[x1 + y2 * gs + z2 * gridSize2];
        let ftr = temperature_in[x2 + y2 * gs + z2 * gridSize2];
        let bbl = temperature_in[x1 + y1 * gs + z1 * gridSize2];
        let bbr = temperature_in[x2 + y1 * gs + z1 * gridSize2];
        let btl = temperature_in[x1 + y2 * gs + z1 * gridSize2];
        let btr = temperature_in[x2 + y2 * gs + z1 * gridSize2];
    
        let xMod = fract(x);
        let yMod = fract(y);
        let zMod = fract(z);
    
        let bilerp = mix(mix(mix(bbl, bbr, xMod), mix(btl, btr, xMod), yMod),
                         mix(mix(fbl, fbr, xMod), mix(ftl, ftr, xMod), yMod), zMod);
        return bilerp;
    }

    fn sample_velocity_at(pos: vec3<f32>, component: i32) -> f32 {
        var x = pos.x;
        var y = pos.y;
        var z = pos.z;
        let gs = gridSize;
        let gridSize2 = gridSize * gridSize;
    
        let x1 = clamp(u32(floor(x)),0,gs);
        let y1 = clamp(u32(floor(y)),0,gs);
        let z1 = clamp(u32(floor(z)),0,gs);
        let x2 = clamp(u32(x1 + 1),0,gs);
        let y2 = clamp(u32(y1 + 1),0,gs);
        let z2 = clamp(u32(z1 + 1),0,gs);
    
        let fbl = velocity_in[x1 + y1 * gs + z2 * gridSize2][component];
        let fbr = velocity_in[x2 + y1 * gs + z2 * gridSize2][component];
        let ftl = velocity_in[x1 + y2 * gs + z2 * gridSize2][component];
        let ftr = velocity_in[x2 + y2 * gs + z2 * gridSize2][component];
        let bbl = velocity_in[x1 + y1 * gs + z1 * gridSize2][component];
        let bbr = velocity_in[x2 + y1 * gs + z1 * gridSize2][component];
        let btl = velocity_in[x1 + y2 * gs + z1 * gridSize2][component];
        let btr = velocity_in[x2 + y2 * gs + z1 * gridSize2][component];
    
        let xMod = fract(x); // Only keeps the fraction (decimalke)
        let yMod = fract(y);
        let zMod = fract(z);
        
        let bilerp = mix(mix(mix(bbl,bbr,xMod), mix(btl,btr,xMod),yMod),
                        mix(mix(fbl,fbr,xMod), mix(ftl,ftr,xMod),yMod), zMod);
        return bilerp;
    }

    @compute @workgroup_size(4,4,4)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
        let x: u32 = global_id.x;
        let y: u32 = global_id.y;
        let z: u32 = global_id.z;

        let idx: u32 = x + y * gridSize + z * gridSize * gridSize;
        let advectedVelocity: vec3<f32> = self_advection(idx, f32(x), f32(y), f32(z));

        velocity_out[idx] = advectedVelocity * 0.999; // Velocity decays!

        borderControl(1, x, y, z, idx);
    }`);
}