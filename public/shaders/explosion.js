import { ComputeShader } from "../utils.js";

export function explosionShader(device, computeShaders) {
    computeShaders.explosion = new ComputeShader("explosion", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read_write> velocity : array<vec2<f32>>;
    @group(0) @binding(1) var<storage, read_write> density : array<f32>;
    @group(0) @binding(2) var<storage, read_write> pressure : array<f32>;
    @group(0) @binding(3) var<uniform> mousePos : vec2<f32>;
    @group(0) @binding(4) var<uniform> gridSize : u32;

    @compute @workgroup_size(16, 16)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let x = global_id.x;
        let y = global_id.y;
        let idx = x + y * gridSize;

        let cellPos = vec2<f32>(f32(x), f32(y));
        let toCell = cellPos - mousePos;
        let dist = length(toCell);
        let rad = 25.0; // effected area
        let strength = 8.0; // how much force is applied
        let dissipate = 1.0;

        let atLeft = (x == 0);
        let atRight = (x == gridSize - 1);
        let atTop = (y == gridSize - 1);
        let atBottom = (y == 0);
        let edgeConditions = atLeft || atRight || atTop || atBottom;

        /* if (dist < 2 * rad && rad < dist && !edgeConditions){
            let force = normalize(toCell) * (strength * (1.0 - (dist * dissipate) / rad));
            velocity[idx] += force;
        } */

        if (dist < rad && !edgeConditions) {
            // Apply an outward force from the mouse position
            let force = normalize(toCell) * (strength * (1.0 - (dist * dissipate) / rad));
            velocity[idx] += force;

            let densityIncrease = 3.0 * (1.0 - dist / rad);
            density[idx] += densityIncrease;

            let pressureIncrease = 1.0 * (1.0 - dist / rad );
            //pressure[idx] += pressureIncrease;
            pressure[idx] = pressure[idx];

            if (density[idx] > 1.0){
                density[idx] = 1.0;
            }

            /*if (pressure[idx] > 1.0){
                pressure[idx] = 1.0;
            }*/

        }
    }`);
}