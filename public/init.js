import { advectShader } from "./shaders/advect.js";
import { divergenceShader } from "./shaders/divergence.js";
import { explosionShader } from "./shaders/explosion.js";
import { pressureShader } from "./shaders/jacobi.js";
import { gradientSubstractionShader } from "./shaders/substraction.js";
import { velocityAdvectionShader } from "./shaders/velocity.js";
import { renderingShader } from "./shaders/render.js";
import { GridBuffer } from "./utils.js";
import {
    cubeVertexArray,
    cubeVertexSize,
    cubeUVOffset,
    cubePositionOffset,
    cubeVertexCount,
  } from './objects/renderCube.js';

export const gridSize = 32;

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
    const format = "rgba8unorm";
    const usage =
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING;
    context.configure({ device, format, usage });
  
    const gridSizeBuffer = device.createBuffer({
        size: 4, // 32-bit integer (byte = 8 bits, 8 * 4 = 32-bit)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(gridSizeBuffer, 0, new Uint32Array([gridSize]));
    
    const renderModeBuffer = device.createBuffer({
        size: 4, // 32-bit integer (byte = 8 bits, 8 * 4 = 32-bit)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(renderModeBuffer,0,new Uint32Array([0]));
    
    const timeBuffer = device.createBuffer({
        size: 4, // 32-bit integer
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    const absorptionBuffer = device.createBuffer({
        size: 4, // 32-bit float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const scatteringBuffer = device.createBuffer({
        size: 4, // 32-bit float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const stepSizeBuffer = device.createBuffer({
        size: 4, // 32-bit float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    const lightStepSizeBuffer = device.createBuffer({
        size: 4, // 32-bit float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const phaseBuffer = device.createBuffer({
        size: 4, // 32-bit float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const explosionLocationBuffer = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    
    const cubeBuffer = device.createBuffer({
        size: cubeVertexArray.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    
    device.queue.writeBuffer(stepSizeBuffer, 0, new Float32Array([0.1]));
    device.queue.writeBuffer(absorptionBuffer, 0, new Float32Array([0.85]));
    device.queue.writeBuffer(scatteringBuffer, 0, new Float32Array([0.5]));
    device.queue.writeBuffer(phaseBuffer, 0, new Float32Array([0.8]));
    
    new Float32Array(cubeBuffer.getMappedRange()).set(cubeVertexArray);
    cubeBuffer.unmap();

    // Create GPU Buffers for Matrices
    const modelBuffer = device.createBuffer({
        size: 16 * 4, // 4x4 matrix (16 floats)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const viewBuffer = device.createBuffer({
        size: 16 * 4, // 4x4 matrix (16 floats)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const projBuffer = device.createBuffer({
        size: 16 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    const invMVPBuffer = device.createBuffer({
        size: 16 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  
    const velocity = new GridBuffer("velocity", device, gridSize * gridSize * gridSize * 3 * Float32Array.BYTES_PER_ELEMENT);

    const density = new GridBuffer("density", device, gridSize * gridSize * gridSize * Float32Array.BYTES_PER_ELEMENT);

    const divergence = new GridBuffer("divergence", device, gridSize * gridSize * gridSize * Float32Array.BYTES_PER_ELEMENT);

    const pressure = new GridBuffer("pressure", device, gridSize * gridSize * gridSize * Float32Array.BYTES_PER_ELEMENT);

    const densityTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float", // 32-bit float for density values
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });

    const smokeSampler = device.createSampler({
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
        magFilter: 'nearest',
        minFilter: 'nearest',
    });

    async function readBufferToFloat32Array(device, buffer, size) {
        // Create a buffer for reading the data
        const readBuffer = device.createBuffer({
            size: size,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,  // Copyable and readable
        });
    
        // Copy the GPU buffer data into the readable buffer
        const commandEncoder = device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(buffer, 0, readBuffer, 0, size);
        device.queue.submit([commandEncoder.finish()]);
    
        // Map the buffer and read the data
        await readBuffer.mapAsync(GPUMapMode.READ);
        const arrayBuffer = readBuffer.getMappedRange();
        const floatArray = new Float32Array(arrayBuffer.slice(0));
    
        readBuffer.unmap();
        return floatArray;
    }

    async function writeTexture(tex, data, size = gridSize * gridSize * gridSize * Float32Array.BYTES_PER_ELEMENT){
        let arr = await readBufferToFloat32Array(device,data,size);
        device.queue.writeTexture(
            { texture: tex },
            arr,
            { bytesPerRow: gridSize * 4, rowsPerImage: gridSize },
            { width: gridSize, height: gridSize, depthOrArrayLayers: gridSize });
    }

    const renderBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0, // Texture
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: "write-only",
                    format: "rgba8unorm",
                    viewDimension: "2d"
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "unfilterable-float",  // or "unfilterable-float" if you're using specific types
                    viewDimension: "3d",
                    format: "r32float"
                }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                sampler: {
                    type: 'non-filtering',
                },
            },
            {
                binding: 3,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 4,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 5,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 6,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 7,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
        ]
    })
    
    // Initializing shaders
    const computeShaders = {};
    const inputBuffers = {
        absorptionBuffer: absorptionBuffer,
        scatteringBuffer: scatteringBuffer,
        stepSizeBuffer: stepSizeBuffer,
        lightStepSizeBuffer: lightStepSizeBuffer,
        phaseBuffer: phaseBuffer,
        gridSizeBuffer: gridSizeBuffer,
    };
    explosionShader(device,computeShaders);
    advectShader(device,computeShaders);
    velocityAdvectionShader(device,computeShaders);
    divergenceShader(device,computeShaders);
    pressureShader(device,computeShaders);
    gradientSubstractionShader(device,computeShaders);
    renderingShader(device,computeShaders,renderBindGroupLayout);
  
    function render(computePass,canvasWidth,canvasHeight) {
        const texture = context.getCurrentTexture();
        computeShaders.render.renderPass(
            device,
            computePass,
            [texture, densityTexture, smokeSampler, stepSizeBuffer, lightStepSizeBuffer, absorptionBuffer, scatteringBuffer, phaseBuffer],
            canvasWidth / 8, canvasHeight / 8);
    }

    return {
        device,
        context,
        timeBuffer,
        explosionLocationBuffer,
        renderModeBuffer,
        cubeBuffer,
        computeShaders,
        density,
        velocity,
        pressure,
        divergence,
        modelBuffer,
        viewBuffer,
        projBuffer,
        invMVPBuffer,
        densityTexture,
        inputBuffers,
        writeTexture,
        render,
    };
}
  