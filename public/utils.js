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
    computePass(device, pass, entries, dispatchX, dispatchY, dispatchZ) {
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
        pass.dispatchWorkgroups(dispatchX, dispatchY, dispatchZ);
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

export function borderControl(in_arr,out_arr,out_val, fun_name ="borderControl"){ 
    // Make a function for wgsl, where the first parameter chooses the type of value there will be on the border of the simulation. 
    // 0 = copy value from inside the simulation to the border.
    // else = border values are 0.
    return /*wgsl*/`
        fn ${fun_name}(t: u32, x: u32, y: u32, z:u32, idx: u32){
            let atLeft = (x == 0);
            let atRight = (x == gridSize - 1);
            let atTop = (y == gridSize - 1);
            let atBottom = (y == 0);
            let atFront = (z == gridSize-1);
            let atBack = (z == 0);
            let atBorder = atLeft || atBottom || atRight || atTop || atBack || atFront;
            if(t == 0){
                if (atLeft) {
                    ${out_arr}[idx] = ${in_arr}[idx + 1];
                }
                else if(atRight) {
                    ${out_arr}[idx] = ${in_arr}[idx - 1];
                }
                else if(atTop) {
                    ${out_arr}[idx] = ${in_arr}[idx - gridSize];
                }
                else if(atBottom) {
                    ${out_arr}[idx] = ${in_arr}[idx + gridSize];
                }
                else if(atFront){
                    ${out_arr}[idx] = ${in_arr}[idx - gridSize * gridSize];
                }
                else if(atBack){
                    ${out_arr}[idx] = ${in_arr}[idx + gridSize * gridSize];
                }
            }else{
                if(atBorder){
                    ${out_arr}[idx] = ${out_val};
                }
            }
        }
    `};