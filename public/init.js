import { GridBuffer } from "./utils.js";

import * as WebGPU from '/WebGPU.js';

import { FirstPersonController } from '/controllers/FirstPersonController.js';

import {
    Camera,
    Material,
    Model,
    Node,
    Primitive,
    Sampler,
    Texture,
    Transform,
} from '/core.js';

import { loadResources } from '/loaders/resources.js';

import { shaderInit } from "./shaders/shaderInit.js";

import { UnlitRenderer } from '/renderers/UnlitRenderer.js';

export let gridSize = 32;

export async function loadShader(filePath) {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${filePath}`);
    }
    return await response.text();
}
  
export async function initialize(canvas) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice({requiredFeatures: ["float32-filterable"]});
    const context = canvas.getContext("webgpu");
    const format = "rgba8unorm";
    const usage =
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC;
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
    device.queue.writeBuffer(renderModeBuffer, 0, new Uint32Array([0]));
    
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
    
    const viscosityBuffer = device.createBuffer({
        size: 4, // 32-bit float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    const decayBuffer = device.createBuffer({
        size: 4, // 32-bit float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    const tViscosityBuffer = device.createBuffer({
        size: 4, // 32-bit float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const explosionLocationBuffer = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    
    
    device.queue.writeBuffer(stepSizeBuffer, 0, new Float32Array([0.05]));
    device.queue.writeBuffer(absorptionBuffer, 0, new Float32Array([0.35]));
    device.queue.writeBuffer(scatteringBuffer, 0, new Float32Array([36.0]));
    device.queue.writeBuffer(phaseBuffer, 0, new Float32Array([0.3]));
    device.queue.writeBuffer(viscosityBuffer, 0, new Float32Array([1.0]));
    device.queue.writeBuffer(decayBuffer, 0, new Float32Array([0.999]));

    device.queue.writeBuffer(tViscosityBuffer, 0, new Float32Array([1.0]));
    

    // Create GPU Buffers for Matrices
    const modelBuffer = device.createBuffer({
        size: 16 * 4, // 4x4 matrix (16 floats)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const viewBuffer = device.createBuffer({
        size: 16 * 4,
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
  
    const velocity = new GridBuffer("velocity", device, gridSize, 3);

    const density = new GridBuffer("density", device, gridSize);

    const divergence = new GridBuffer("divergence", device, gridSize);

    const pressure = new GridBuffer("pressure", device, gridSize);

    const temperature = new GridBuffer("temperature", device, gridSize);

    const smokeTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float", // 32-bit float for density values
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });
    
    const temperatureTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });

    const smokeSampler = device.createSampler({
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
        magFilter: 'linear', // Enables trilinear sampling
        minFilter: 'linear',
    });
    
    const temperatureSampler = device.createSampler({
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
        magFilter: 'linear',
        minFilter: 'linear',
    });

    const resources = await loadResources({
        'mesh': new URL('/floor/floor.json', import.meta.url),
        'image': new URL('/floor/grass.png', import.meta.url),
    });

    const renderer = new UnlitRenderer(device, canvas, context, format);
    await renderer.initialize();
    
    const scene = new Node();
    
    const camera = new Node();
    camera.addComponent(new Transform({
        translation: [0, 1, 0],
    }));
    camera.addComponent(new Camera());
    camera.addComponent(new FirstPersonController(camera, canvas));
    scene.addChild(camera);
    
    const floor = new Node();
    floor.addComponent(new Transform({
        scale: [10, 1, 10],
    }));
    floor.addComponent(new Model({
        primitives: [
            new Primitive({
                mesh: resources.mesh,
                material: new Material({ 
                    baseTexture: new Texture({
                        image: resources.image,
                        sampler: new Sampler({
                            minFilter: 'nearest',
                            magFilter: 'nearest',
                            addressModeU: 'repeat',
                            addressModeV: 'repeat',
                        }),
                    }),
                }),
            }),
        ],
    }));
    scene.addChild(floor);

    function updateScene(t, dt) {
        scene.traverse(node => {
            for (const component of node.components) {
                component.update?.(t, dt);
            }
        });
    }

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
    const gridBuffers = {velocity: velocity, density: density, divergence: divergence, pressure: pressure, temperature: temperature};
    shaderInit(device,computeShaders);

    
    function smokeRender(computePass, canvasTexture,  readableTexture, canvasWidth, canvasHeight) {
        computeShaders.render.renderPass(
            device,
            computePass,
            [canvasTexture, readableTexture, smokeTexture, smokeSampler, temperatureTexture, temperatureSampler, stepSizeBuffer, lightStepSizeBuffer, absorptionBuffer, scatteringBuffer, phaseBuffer],
            canvasWidth / 8, canvasHeight / 8);
    }

    return {
        device,
        context,
        timeBuffer,
        explosionLocationBuffer,
        renderModeBuffer,
        decayBuffer,
        viscosityBuffer,
        tViscosityBuffer,
        computeShaders,
        gridBuffers,
        modelBuffer,
        viewBuffer,
        projBuffer,
        invMVPBuffer,
        smokeTexture,
        temperatureTexture,
        inputBuffers,
        smokeRender,
        renderer,
        updateScene,
        scene,
        camera,
    };
}
  