import { ComputeShader } from "../utils.js";

export function velocityAdvectionShader(device, computeShaders) {
    computeShaders.velocity = new ComputeShader("velocity", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read> velocity_in : array<vec2<f32>>;
    @group(0) @binding(1) var<storage, read_write> velocity_out : array<vec2<f32>>;
    @group(0) @binding(2) var<uniform> gridSize : u32;
    @group(0) @binding(3) var<uniform> dt : f32;

    fn self_advection(idx:u32, x: f32, y: f32) -> vec2<f32> {
        let vel: vec2<f32> = velocity_in[idx];
        let prevPos: vec2<f32> = vec2<f32>(x, y) - vel * dt;
        if (max(prevPos.x,prevPos.y) <= f32(gridSize) && min(prevPos.x,prevPos.y) >= 0){
            return vec2<f32>(sample_velocity_at(prevPos,0),sample_velocity_at(prevPos,1));
        }
        return vec2<f32>(0.0,0.0);
    }

    fn sample_velocity_at(pos: vec2<f32>, component: i32) -> f32 {
        var x = pos.x;
        var y = pos.y;

        let gs = gridSize - 1;


        let x1 = clamp(u32(floor(x)),0,gs);
        let y1 = clamp(u32(floor(y)),0,gs);
        let x2 = clamp(u32(x1 + 1),0,gs);
        let y2 = clamp(u32(y1 + 1),0,gs);

        let bl = velocity_in[x1 + y1 * gridSize][component];
        let br = velocity_in[x2 + y1 * gridSize][component];
        let tl = velocity_in[x1 + y2 * gridSize][component];
        let tr = velocity_in[x2 + y2 * gridSize][component];
    
        let xMod = fract(x); // Only keeps the fraction
        let yMod = fract(y);
        
        let bilerp = mix(mix(bl, br, xMod), mix(tl, tr, xMod), yMod);
        return bilerp;
    }

    @compute @workgroup_size(16, 16)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
        let x: u32 = global_id.x;
        let y: u32 = global_id.y;

        var result: vec2<f32> = vec2<f32>(0.0,0.0);
        let idx: u32 = x + y * gridSize;
        let advectedVelocity: vec2<f32> = self_advection(idx, f32(x), f32(y));

        velocity_out[idx] = advectedVelocity * 0.999;

        let atLeft = (x == 0);
        let atRight = (x == gridSize - 1);
        let atTop = (y == gridSize - 1);
        let atBottom = (y == 0);

        if (atLeft) {
            velocity_out[idx] = velocity_in[idx + 1]; // Copy velocity from the inside
        }
        if (atRight) {
            velocity_out[idx] = velocity_in[idx - 1];
        }
        if (atTop) {
            velocity_out[idx] = velocity_in[idx - gridSize];
        }
        if (atBottom) {
            velocity_out[idx] = velocity_in[idx + gridSize];
        }
    }`);
}