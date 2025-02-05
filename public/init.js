import { advectShader } from "./shaders/advect.js";
import { divergenceShader } from "./shaders/divergence.js";
import { explosionShader } from "./shaders/explosion.js";
import { pressureShader } from "./shaders/jacobi.js";
import { gradientSubstractionShader } from "./shaders/substraction.js";
import { velocityAdvectionShader } from "./shaders/velocity.js";
import { GridBuffer } from "./utils.js";

export async function loadShader(filePath) {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${filePath}`);
    }
    return await response.text();
}
  
export async function initialize(canvas) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    const format = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device: device,
        format: format,
        alphaMode: "opaque",
      });

    const gridSize = 256;
    const halfSize = gridSize / 2;

    const renderShaderCode = await loadShader('/shaders/render.wgsl');
  
    const gridSizeBuffer = device.createBuffer({
        size: 4, // 32-bit integer (byte = 8 bits, 8 * 4 = 32-bit)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(gridSizeBuffer, 0, new Uint32Array([gridSize]));
  
    const timeBuffer = device.createBuffer({
        size: 4, // 32-bit integer
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const explosionLocationBuffer = device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
  
    const velocity = new GridBuffer("velocity", device, gridSize * gridSize * 2 * Float32Array.BYTES_PER_ELEMENT);

    const density = new GridBuffer("density", device, gridSize * gridSize * Float32Array.BYTES_PER_ELEMENT);

    const divergence = new GridBuffer("divergence", device, gridSize * gridSize * Float32Array.BYTES_PER_ELEMENT);

    const pressure = new GridBuffer("pressure", device, gridSize * gridSize * Float32Array.BYTES_PER_ELEMENT);

     // Initialize custom velocity and density grid values.
    /* const initialVelocityData = new Float32Array(gridSize * gridSize * 2).fill(0);
    const initialDensityData = new Float32Array(gridSize * gridSize);

    // Fill velocity buffer with circular flow
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const index = (y * gridSize + x) * 2; // Each cell has 2 velocity components
            if (x < halfSize && y < halfSize) {
                initialVelocityData[index] = -0.1; // right 
                initialVelocityData[index + 1] = 0.1; 
            } else if (x >= halfSize && y < halfSize) {
                initialVelocityData[index] = -0.1; // right 
                initialVelocityData[index + 1] = 0.1; 
            } else if (x >= halfSize && y >= halfSize) {
                initialVelocityData[index] = -0.1; // right 
                initialVelocityData[index + 1] = 0.1; 
            } else {
                initialVelocityData[index] = -0.1; // right 
                initialVelocityData[index + 1] = 0.1; 
            }
        }
    } 
  
    
    

    // Update the buffers with custom velocity and density!
    device.queue.writeBuffer(
        velocity.readBuffer,            // Which buffer to write in
        0,                              // Offset in bytes from start
        initialVelocityData.buffer,     // Which buffer to read from
        0,                              // Byte offset for read buffer
        initialVelocityData.byteLength  // Number of bytes to copy
    ); */
    

    /* const initialDensityData = new Float32Array(gridSize * gridSize);

    for (let x = 32; x < 96; x++) {
        for (let y = 32; y < 96; y++) {
            initialDensityData[y * 128 + x] = Math.random();
        }
    }

    device.queue.writeBuffer(density.readBuffer,0,initialDensityData.buffer,0,initialDensityData.byteLength); */
    
    // Initializing shaders
    const computeShaders = {};
    explosionShader(device,computeShaders);
    advectShader(device,computeShaders);
    velocityAdvectionShader(device,computeShaders);
    divergenceShader(device,computeShaders);
    pressureShader(device,computeShaders);
    gradientSubstractionShader(device,computeShaders);
  
    // Create the render pipeline
    const renderModule = device.createShaderModule({ code: renderShaderCode });
    const renderPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: renderModule, entryPoint: "vertex_main" },
        fragment: { module: renderModule, entryPoint: "fragment_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    });
  
    const renderBindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: density.readBuffer } },
            { binding: 1, resource: { buffer: gridSizeBuffer } },
        ]});
  
    return {
        device,
        context,
        gridSizeBuffer,
        timeBuffer,
        explosionLocationBuffer,
        computeShaders,
        renderPipeline,
        renderBindGroup,
        density,
        velocity,
        pressure,
        divergence
    };
}
  