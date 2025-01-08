// Group and binding gives memory locations, var tells us its a variable
// Storage tells us we want to store it on the GPU and read_write tells us we will be both reading and writing into the variable grid.
// Compute tells us this is a compute shader, workgroup defines the number of threads (16x16) in a single workgroup, those are initialized in JS code.
// Main is the entry point in all compute shaders, with the builtin we defined a vector with global thread ID's that seperate workload between threads.
// Understand Main as a seperate function for each of the 256 threads, global_id.x and global_id.y tell us which thread we're working with.



/*@group(0) @binding(0) var<storage, read_write> grid : array<f32>;


@compute @workgroup_size(16, 16) // each workgroup has 256 threads
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    let x = global_id.x;
    let y = global_id.y;
    let idx = y * 128u + x;
    if (x < 128u && y < 128u) {
        grid[idx] += 0.001 * f32(x + 1) / 128.0;
    }
}*/