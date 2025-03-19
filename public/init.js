import { advectShader } from "./shaders/advect.js";
import { divergenceShader } from "./shaders/divergence.js";
import { explosionShader } from "./shaders/explosion.js";
import { pressureShader } from "./shaders/jacobi.js";
import { gradientSubstractionShader } from "./shaders/substraction.js";
import { velocityAdvectionShader } from "./shaders/velocity.js";
import { GridBuffer } from "./utils.js";
import {
    cubeVertexArray,
    cubeVertexSize,
    cubeUVOffset,
    cubePositionOffset,
    cubeVertexCount,
  } from './objects/renderCube.js';

export const gridSize = 64;

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

    const renderShaderCode = await loadShader('/shaders/render.wgsl');
  
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
    const stepSizeBuffer = device.createBuffer({
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
        vertex: { module: renderModule,
            entryPoint: "vertex_main",
            buffers: [{
                arrayStride: cubeVertexSize,
                attributes: [
                    {
                        // position
                        shaderLocation: 0,
                        offset: cubePositionOffset,
                        format: 'float32x4',
                    },
                    {
                        // uv
                        shaderLocation: 1,
                        offset: cubeUVOffset,
                        format: 'float32x2',
                    },
                ],
            }]
        },
        fragment: { 
            module: renderModule,
            entryPoint: "fragment_main",
            targets: [{
                format,
                blend: {
                    color: {
                        srcFactor: "src-alpha",
                        dstFactor: "one-minus-src-alpha",
                        operation: "add"
                    },
                    alpha: {
                        srcFactor: "one",
                        dstFactor: "one-minus-src-alpha",
                        operation: "add"
                    }
                },
                writeMask: GPUColorWrite.ALL
            }]
        },
        primitive: { 
            topology: "triangle-list",
            cullMode: "back"
        },
        depthStencil: { depthWriteEnabled: true,
            depthCompare: "less",
            format: "depth24plus"
        }
    });

    console.log(canvas.scrollHeight)

    const depthTexture = device.createTexture({
        size: [canvas.scrollWidth, canvas.scrollHeight],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    const renderBindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: modelBuffer } },
            { binding: 1, resource: { buffer: viewBuffer } },
            { binding: 2, resource: { buffer: projBuffer } },
            { binding: 3, resource: { buffer: invMVPBuffer } },
            { binding: 4, resource: { buffer: density.readBuffer } },
            { binding: 5, resource: { buffer: velocity.readBuffer } },
            { binding: 6, resource: { buffer: pressure.readBuffer } },
            { binding: 7, resource: { buffer: divergence.readBuffer } },
            { binding: 8, resource: { buffer: gridSizeBuffer } },
            { binding: 9, resource: { buffer: renderModeBuffer } },
    ]});

    const renderPassDescriptor = {
        colorAttachments: [
          {
            view: undefined,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.05, g: 0.10, b: 0.05, a: 1.0 }
          },
        ],
        depthStencilAttachment: {
            view: depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
      }
  
    return {
        device,
        context,
        gridSizeBuffer,
        timeBuffer,
        explosionLocationBuffer,
        renderModeBuffer,
        cubeBuffer,
        stepSizeBuffer,
        renderPassDescriptor,
        computeShaders,
        renderPipeline,
        renderBindGroup,
        density,
        velocity,
        pressure,
        divergence,
        modelBuffer,
        viewBuffer,
        projBuffer,
        invMVPBuffer
    };
}
  