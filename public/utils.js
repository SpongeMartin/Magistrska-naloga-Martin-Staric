export class ComputeShader {
    /**
     * Creates an instance of Compute shader. Also takes care of the binding process and dispatching process.
     * @param {string} label - A label for identifying the shader.
     * @param {GPUDevice} device - The GPU device used to create buffers.
     * @param {string} code - The WGSL code for the shader.
     */
    constructor(label, device, code) {
        this.label = label;
        this.pipeline = device.createComputePipeline({
            label,
            layout: 'auto',
            compute: {
                module: device.createShaderModule({
                    label,
                    code
                })
            },
        });

    }

    // Add component dispatchZ for 3D
    computePass(device, pass, entries, dispatchX, dispatchY) {
        pass.setPipeline(this.pipeline);
        let bindingIndex = 0;
        pass.setBindGroup(0, device.createBindGroup({
            label: this.label,
            layout: this.pipeline.getBindGroupLayout(0),
            entries: entries.flatMap(element => {
                if (element instanceof GridBuffer) {
                    const bindings = [
                        { binding: bindingIndex++, resource: { buffer: element.readBuffer } },
                        { binding: bindingIndex++, resource: { buffer: element.writeBuffer } }
                    ];
                    return bindings;
                } else {
                    return { binding: bindingIndex++, resource: { buffer: element } };
                }
            })}));
        pass.dispatchWorkgroups(dispatchX, dispatchY);
        entries.forEach(entry => { if (entry instanceof GridBuffer) entry.swap(); });
    }
}

export class GridBuffer {
    /**
     * Creates an instance of GridBuffer. Operates as a single unit ping pong buffer.
     * @param {string} label - A label for identifying the buffer.
     * @param {GPUDevice} device - The GPU device used to create buffers.
     * @param {number} size - The size of the buffer in bytes.
     */
    constructor(label,device,size) {
        this.readBuffer = device.createBuffer({
            size: size,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });

        this.writeBuffer = device.createBuffer({
            size: size,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        this.label = label;
    }

    swap(){
        let tmp = this.readBuffer;
        this.readBuffer = this.writeBuffer;
        this.writeBuffer = tmp;
    }
}
