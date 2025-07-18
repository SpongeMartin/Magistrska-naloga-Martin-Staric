import { mat4 } from '/glm.js';

import * as WebGPU from '../WebGPU.js';

import { Camera, Model } from '../core.js';

import { createVertexBuffer } from '../core/VertexUtils.js';

import {
    getLocalModelMatrix,
    getGlobalViewMatrix,
    getProjectionMatrix,
} from '../core/SceneUtils.js';

const vertexBufferLayout = {
    arrayStride: 20,
    attributes: [
        {
            name: 'position',
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
        },
        {
            name: 'texcoords',
            shaderLocation: 1,
            offset: 12,
            format: 'float32x2',
        },
    ],
};

export class UnlitRenderer{

    constructor(device, canvas, context, format) {
        this.context = context;
        this.gpuObjects = new WeakMap();
        this.depthTexture = null;
        this.renderPass = null;
        this.pipeline = null;
        this.device = device;
        this.format = format;
        this.canvas = canvas;
    }

    async initialize() {

        const code = /*wgsl*/ `struct VertexInput {
                        @location(0) position: vec3f,
                        @location(1) texcoords: vec2f,
                    }

                    struct VertexOutput {
                        @builtin(position) position: vec4f,
                        @location(1) texcoords: vec2f,
                    }

                    struct FragmentInput {
                        @location(1) texcoords: vec2f,
                    }

                    struct FragmentOutput {
                        @location(0) color: vec4f,
                    }

                    struct CameraUniforms {
                        viewMatrix: mat4x4f,
                        projectionMatrix: mat4x4f,
                    }

                    struct ModelUniforms {
                        modelMatrix: mat4x4f,
                        normalMatrix: mat3x3f,
                    }

                    struct MaterialUniforms {
                        baseFactor: vec4f,
                    }

                    @group(0) @binding(0) var<uniform> camera: CameraUniforms;

                    @group(1) @binding(0) var<uniform> model: ModelUniforms;

                    @group(2) @binding(0) var<uniform> material: MaterialUniforms;
                    @group(2) @binding(1) var baseTexture: texture_2d<f32>;
                    @group(2) @binding(2) var baseSampler: sampler;

                    @vertex
                    fn vertex(input: VertexInput) -> VertexOutput {
                        var output: VertexOutput;

                        output.position = camera.projectionMatrix * camera.viewMatrix * model.modelMatrix * vec4(input.position, 1);
                        output.texcoords = input.texcoords;

                        return output;
                    }

                    @fragment
                    fn fragment(input: FragmentInput) -> FragmentOutput {
                        var output: FragmentOutput;

                        output.color = textureSample(baseTexture, baseSampler, input.texcoords) * material.baseFactor;

                        return output;
                    }
                    `;
        const module = this.device.createShaderModule({ code });

        this.pipeline = await this.device.createRenderPipelineAsync({
            layout: 'auto',
            vertex: {
                module,
                buffers: [ vertexBufferLayout ],
            },
            fragment: {
                module,
                targets: [{ format: this.format }],
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
        });

        this.recreateDepthTexture();
    }

    recreateDepthTexture() {
        this.depthTexture?.destroy();
        this.depthTexture = this.device.createTexture({
            format: 'depth24plus',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    prepareImage(image, isSRGB = false) {
            if (this.gpuObjects.has(image)) {
                return this.gpuObjects.get(image);
            }
    
            const gpuTexture = WebGPU.createTexture(this.device, {
                source: image,
                format: isSRGB ? 'rgba8unorm-srgb' : 'rgba8unorm',
            });
    
            const gpuObjects = { gpuTexture };
            this.gpuObjects.set(image, gpuObjects);
            return gpuObjects;
    }
    
    prepareSampler(sampler) {
        if (this.gpuObjects.has(sampler)) {
            return this.gpuObjects.get(sampler);
        }

        const gpuSampler = this.device.createSampler(sampler);

        const gpuObjects = { gpuSampler };
        this.gpuObjects.set(sampler, gpuObjects);
        return gpuObjects;
    }

    prepareMesh(mesh, layout) {
        if (this.gpuObjects.has(mesh)) {
            return this.gpuObjects.get(mesh);
        }

        const vertexBufferArrayBuffer = createVertexBuffer(mesh.vertices, layout);
        const vertexBuffer = WebGPU.createBuffer(this.device, {
            data: vertexBufferArrayBuffer,
            usage: GPUBufferUsage.VERTEX,
        });

        const indexBufferArrayBuffer = new Uint32Array(mesh.indices).buffer;
        const indexBuffer = WebGPU.createBuffer(this.device, {
            data: indexBufferArrayBuffer,
            usage: GPUBufferUsage.INDEX,
        });

        const gpuObjects = { vertexBuffer, indexBuffer };
        this.gpuObjects.set(mesh, gpuObjects);
        return gpuObjects;
    }

    prepareNode(node) {
        if (this.gpuObjects.has(node)) {
            return this.gpuObjects.get(node);
        }

        const modelUniformBuffer = this.device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const modelBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [ 
                { binding: 0, resource: { buffer: modelUniformBuffer } },
            ],
        });

        const gpuObjects = { modelUniformBuffer, modelBindGroup };
        this.gpuObjects.set(node, gpuObjects);
        return gpuObjects;
    }

    prepareCamera(camera) {
        if (this.gpuObjects.has(camera)) {
            return this.gpuObjects.get(camera);
        }

        const cameraUniformBuffer = this.device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const cameraBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: cameraUniformBuffer } },
            ],
        });

        const gpuObjects = { cameraUniformBuffer, cameraBindGroup };
        this.gpuObjects.set(camera, gpuObjects);
        return gpuObjects;
    }

    prepareTexture(texture) {
        if (this.gpuObjects.has(texture)) {
            return this.gpuObjects.get(texture);
        }

        const { gpuTexture } = this.prepareImage(texture.image); // ignore sRGB
        const { gpuSampler } = this.prepareSampler(texture.sampler);

        const gpuObjects = { gpuTexture, gpuSampler };
        this.gpuObjects.set(texture, gpuObjects);
        return gpuObjects;
    }

    prepareMaterial(material) {
        if (this.gpuObjects.has(material)) {
            return this.gpuObjects.get(material);
        }

        const baseTexture = this.prepareTexture(material.baseTexture);

        const materialUniformBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const materialBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(2),
            entries: [
                { binding: 0, resource: { buffer: materialUniformBuffer } },
                { binding: 1, resource: baseTexture.gpuTexture.createView() },
                { binding: 2, resource: baseTexture.gpuSampler },
            ],
        });

        const gpuObjects = { materialUniformBuffer, materialBindGroup };
        this.gpuObjects.set(material, gpuObjects);
        return gpuObjects;
    }

    render(scene, camera) {
        if (this.depthTexture.width !== this.canvas.width || this.depthTexture.height !== this.canvas.height) {
            this.recreateDepthTexture();
        }

        const encoder = this.device.createCommandEncoder();
        this.renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: [0.572, 0.772, 0.921, 1],
                    //clearValue: [0.0, 0.0, 0.0, 1],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'discard',
            },
        });
        this.renderPass.setPipeline(this.pipeline);

        const cameraComponent = camera.getComponentOfType(Camera);
        const viewMatrix = getGlobalViewMatrix(camera);
        const projectionMatrix = getProjectionMatrix(camera);
        const { cameraUniformBuffer, cameraBindGroup } = this.prepareCamera(cameraComponent);
        this.device.queue.writeBuffer(cameraUniformBuffer, 0, viewMatrix);
        this.device.queue.writeBuffer(cameraUniformBuffer, 64, projectionMatrix);
        this.renderPass.setBindGroup(0, cameraBindGroup);

        this.renderNode(scene);

        this.renderPass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    renderNode(node, modelMatrix = mat4.create()) {
        const localMatrix = getLocalModelMatrix(node);
        modelMatrix = mat4.multiply(mat4.create(), modelMatrix, localMatrix);
        const normalMatrix = mat4.normalFromMat4(mat4.create(), modelMatrix);

        const { modelUniformBuffer, modelBindGroup } = this.prepareNode(node);
        this.device.queue.writeBuffer(modelUniformBuffer, 0, modelMatrix);
        this.device.queue.writeBuffer(modelUniformBuffer, 64, normalMatrix);
        this.renderPass.setBindGroup(1, modelBindGroup);

        for (const model of node.getComponentsOfType(Model)) {
            this.renderModel(model);
        }

        for (const child of node.children) {
            this.renderNode(child, modelMatrix);
        }
    }

    renderModel(model) {
        for (const primitive of model.primitives) {
            this.renderPrimitive(primitive);
        }
    }

    renderPrimitive(primitive) {
        const { materialUniformBuffer, materialBindGroup } = this.prepareMaterial(primitive.material);
        this.device.queue.writeBuffer(materialUniformBuffer, 0, new Float32Array(primitive.material.baseFactor));
        this.renderPass.setBindGroup(2, materialBindGroup);

        const { vertexBuffer, indexBuffer } = this.prepareMesh(primitive.mesh, vertexBufferLayout);
        this.renderPass.setVertexBuffer(0, vertexBuffer);
        this.renderPass.setIndexBuffer(indexBuffer, 'uint32');

        this.renderPass.drawIndexed(primitive.mesh.indices.length);
    }

}
