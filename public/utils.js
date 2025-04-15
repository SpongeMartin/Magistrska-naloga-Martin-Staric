export class ComputeShader {
    /**
     * Creates an instance of Compute shader. Also takes care of the binding process and dispatching process.
     * @param {string} label - A label for identifying the shader.
     * @param {GPUDevice} device - The GPU device used to create buffers.
     * @param {string} code - The WGSL code for the shader.
     * @param {BindGroupLayout} code - The WGSL code for the shader.
     */
    constructor(label, device, code, my_layout = "auto") {
        this.label = label;
        this.pipeline = device.createComputePipeline({
            label,
            layout: my_layout,
            compute: {
                module: device.createShaderModule({
                    label,
                    code
                })
            },
        });
    }

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

    renderPass(device,pass,entries,dispatchX,dispatchY) {
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
                } else if (element instanceof GPUTexture){
                    return { binding: bindingIndex++, resource: element.createView() };
                } else if (element instanceof GPUSampler){
                    return { binding: bindingIndex++, resource: element };
                } else {
                    return { binding: bindingIndex++, resource: { buffer: element } };
                }
            })}));
        pass.dispatchWorkgroups(Math.floor(dispatchX), Math.floor(dispatchY));
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

export function handleInputs(device, inputBuffers) {
    const stepInput = document.getElementById('stepSize');
    const gridInput = document.getElementById('grid');
    const absorptionInput = document.getElementById('absorption');
    const scatteringInput = document.getElementById('scattering');
    const phaseInput = document.getElementById('phase');
    const lightInput = document.getElementById('light-step');

    const stepDisplay = document.getElementById('stepVal');
    const gridDisplay = document.getElementById('gridVal');
    const absorptionDisplay = document.getElementById('absorptionVal');
    const scatteringDisplay = document.getElementById('scatteringVal');
    const phaseDisplay = document.getElementById('phaseVal');
    const lightDisplay = document.getElementById('light-stepVal');

    let stepSize = parseFloat(stepInput.value);
    let gridSize = parseFloat(gridInput.value);
    let absorption = parseFloat(absorptionInput.value);
    let scattering = parseFloat(scatteringInput.value);
    let phase = parseFloat(phaseInput.value);
    let lightSize = parseFloat(lightInput.value);

    stepInput.addEventListener('input', (e) => {
        stepSize = parseFloat(e.target.value);
        stepDisplay.textContent = stepSize;
        device.queue.writeBuffer(inputBuffers.stepSizeBuffer, 0, new Float32Array([stepSize]));
    });
    gridInput.addEventListener('input', (e) => {
        gridSize = parseFloat(e.target.value);
        gridDisplay.textContent = gridSize;
        device.queue.writeBuffer(inputBuffers.gridSizeBuffer, 0, new Float32Array([gridSize]));
    });
    absorptionInput.addEventListener('input', (e) => {
        absorption = parseFloat(e.target.value);
        absorptionDisplay.textContent = absorption;
        device.queue.writeBuffer(inputBuffers.absorptionBuffer, 0, new Float32Array([absorption]));
    });
    scatteringInput.addEventListener('input', (e) => {
        scattering = parseFloat(e.target.value);
        scatteringDisplay.textContent = scattering;
        device.queue.writeBuffer(inputBuffers.scatteringBuffer, 0, new Float32Array([scattering]));
    });
    phaseInput.addEventListener('input', (e) => {
        phase = parseFloat(e.target.value);
        phaseDisplay.textContent = phase;
        device.queue.writeBuffer(inputBuffers.phaseBuffer, 0, new Float32Array([phase]));
    });
    lightInput.addEventListener('input', (e) => {
        lightSize = parseFloat(e.target.value);
        lightDisplay.textContent = lightSize;
        device.queue.writeBuffer(inputBuffers.lightStepSizeBuffer, 0, new Float32Array([lightSize]));
    });
}