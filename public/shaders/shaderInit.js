import { advectShader } from "./advect.js";
import { divergenceShader } from "./divergence.js";
import { explosionShader } from "./explosion.js";
import { pressureShader } from "./jacobi.js";
import { gradientSubstractionShader } from "./substraction.js";
import { velocityAdvectionShader } from "./velocity.js";
import { renderingShader } from "./render.js";
import { diffuseShader } from "./diffuse.js";

export function shaderInit(device, computeShaders) {
    const renderBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0, // Canvas Texture
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: "write-only",
                    format: "rgba8unorm",
                    viewDimension: "2d"
                }
            },
            {
                binding: 1, // Canvas Texture
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: "read-only",
                    format: "rgba8unorm",
                    viewDimension: "2d"
                }
            },
            {
                binding: 2, // Smoke texture
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "3d",
                    format: "r32float"
                }
            },
            {
                binding: 3, // Smoke trilinear sampler
                visibility: GPUShaderStage.COMPUTE,
                sampler: {
                    type: 'filtering',
                },
            },
            {
                binding: 4, // Temperature texture
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "3d",
                    format: "r32float"
                }
            },
            {
                binding: 5, // Temperature trilinear sampler
                visibility: GPUShaderStage.COMPUTE,
                sampler: {
                    type: 'filtering',
                },
            },
            {
                binding: 6, // Ray Marching Step Size
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 7, // Ray Marching Step Size Toward Light
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 8, // Absorption coefficient
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 9, // Scattering coefficient
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 10, // Phase
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 11, // Local Model Matrix
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 12, // Model Matrix
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 13, // View Matrix
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 14, // Projection Matrix
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
            {
                binding: 15, // Camera Position
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                },
            },
        ]
    });

    explosionShader(device,computeShaders);
    advectShader(device,computeShaders);
    diffuseShader(device,computeShaders);
    velocityAdvectionShader(device,computeShaders);
    divergenceShader(device,computeShaders);
    pressureShader(device,computeShaders);
    gradientSubstractionShader(device,computeShaders);
    renderingShader(device,computeShaders,renderBindGroupLayout);
}