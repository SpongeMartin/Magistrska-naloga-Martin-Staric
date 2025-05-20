import { gridSize as gs } from "./init.js";
import { initGPUObjects } from "./shaders/shaderInit.js";

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
        for (const [key, elements] of Object.entries(entries)) {
            let bindingIndex = 0;
            let group = Number(key);
            pass.setBindGroup(group, device.createBindGroup({
                label: this.label + key,
                layout: this.pipeline.getBindGroupLayout(key),
                entries: elements.flatMap((element) => {
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
                })
            }));
            elements.forEach(entry => { if (entry instanceof GridBuffer) entry.swap(); });
        }
        pass.dispatchWorkgroups(Math.floor(dispatchX), Math.floor(dispatchY));
    }
}

export class GridBuffer {
    /**
     * Creates an instance of GridBuffer. Operates as a single unit ping pong buffer.
     * @param {string} label - A label for identifying the buffer.
     * @param {GPUDevice} device - The GPU device used to create buffers.
     * @param {number} size - The size of the buffer in bytes.
     * @param {number} components - The number of components in each cell. Default = 1.
     */
    constructor(label, device, size, components = 1) {
        this.components = components;
        this.readBuffer = device.createBuffer({
            size: size * size * size * components * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });

        this.writeBuffer = device.createBuffer({
            size: size * size * size * components * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        this.copyBuffer = device.createBuffer({
            size: size * size * size * components * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        this.label = label;
    }

    async read(device, commandEncoder) {
        await commandEncoder.copyBufferToBuffer(this.readBuffer, 0, this.copyBuffer, 0, gs.value * gs.value * gs.value * this.components);
        device.queue.submit([commandEncoder.finish()]);
        await this.copyBuffer.mapAsync(GPUMapMode.READ);
        const arrayBuffer = this.copyBuffer.getMappedRange();
        const dataRead = new Float32Array(arrayBuffer);
        console.log([...dataRead]);
        await this.copyBuffer.unmap();
    }

    swap() {
        let tmp = this.readBuffer;
        this.readBuffer = this.writeBuffer;
        this.writeBuffer = tmp;
    }
}

export function borderControl(in_arr,out_arr,out_val, fun_name = "borderControl"){ 
    // Make a function for wgsl, where the first parameter chooses the type of value there will be on the border of the simulation. 
    // 0 = copy value from inside the simulation to the border.
    // else = border values are 0.
    return /*wgsl*/`
        fn ${fun_name}(t: u32, x: u32, y: u32, z:u32, idx: u32){
            let atLeft = (x == 0);
            let atRight = (x == gridSize);
            let atTop = (y == gridSize);
            let atBottom = (y == 0);
            let atFront = (z == gridSize);
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

export class GUI {
    constructor(device, buffers){
        this.elements = {};
        const gui = document.createElement('div');
        gui.id = 'gui';
        document.body.appendChild(gui);
        this.gui = gui;
        this.buffers = buffers;
        this.device = device;
    }

    init(){
        Object.entries(this.buffers).forEach(([id, buffer]) => {
            if (buffer.input) this.createInput(buffer, id, buffer.name, buffer.initial_value, buffer.min, buffer.max, buffer.step);
        });
    }

    createInput(buffer, id, label, defaultValue, min, max, step){
        const input = document.createElement('input');
        input.type = 'range';
        input.id = id;
        input.class = "range";
        input.min = min;
        input.max = max;
        input.value = parseFloat(defaultValue.toFixed(2));
        input.step = step || 0.01;
        input.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            buffer.update(value);
            this.updateDisplay(id, value);
            if (label == "Grid Size") {
                initGPUObjects(this.device, value);
                gs.value = value;
            }
        });
        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        labelElement.setAttribute('for', id);
        const display = document.createElement('span');
        display.id = id + 'Val';
        display.textContent = defaultValue;
        const container = document.createElement('div');
        container.appendChild(labelElement);
        container.appendChild(input);
        container.appendChild(display);
        this.gui.appendChild(container);
        this.elements[id] = { input, display };
    }

    updateValue(id, value){
        const buffer = this.buffers[id + 'Buffer'];
        
        if (buffer) {
            this.device.queue.writeBuffer(buffer, 0, new Float32Array([value]));
        }
    }

    updateDisplay(id, value){
        const display = this.elements[id].display;
        display.textContent = value;
    }
}

async function readBufferToFloat32Array(device, buffer, size) {
    size *= Float32Array.BYTES_PER_ELEMENT;
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

export async function writeTexture(device, tex, data, components = 1){
    let arr = await readBufferToFloat32Array(device, data, gs.value ** 3 * components);
    if (components == 4){
        let arr2 = new Float32Array(gs.value ** 3 * 4);
        for (let i = 0, j = 0; j < arr.length; i+=3, j+=3){
            arr2[i] = arr[j];
            arr2[i+1] = arr[j+1];
            arr2[i+2] = arr[j+2];
            arr2[i+3] = 0.0;
        }
        device.queue.writeTexture(
            { texture: tex },
            arr2,
            { bytesPerRow: gs.value * 4 * 4, rowsPerImage: gs.value },
            { width: gs.value, height: gs.value, depthOrArrayLayers: gs.value })
    }
    else device.queue.writeTexture(
        { texture: tex },
        arr,
        { bytesPerRow: gs.value * 4, rowsPerImage: gs.value },
        { width: gs.value, height: gs.value, depthOrArrayLayers: gs.value });
}

class Buffer {
    constructor(device, name, size, value, min, max, step, usage = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, type = Float32Array) {
        this.device = device;
        this._name = name;
        this._buffer = device.createBuffer({
            size: size,
            usage: usage
        });
        this.type = type;
        if (value) {
            this.update(value);
            this.initial_value = value;
        }
        if (max) {
            this._max = max;
            this._min = min;
            this._step = step;
            this._input = true;
        } else this._input = false;
    }
    
    get value(){
        return this.initial_value;
    }

    get name(){
        return this._name;
    }

    get min(){
        return this._min;
    }

    get max(){
        return this._max;
    }

    get step(){
        return this._step;
    }

    get input(){
        return this._input;
    }

    get buffer(){
        return this._buffer;
    }

    update(value) {
        this.device.queue.writeBuffer(this._buffer, 0, new this.type([value]));
    }
}

export function createBuffer(device, buffers, id, name, size, value, min, max, step, type = Float32Array, usage = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) {
    buffers[id] = new Buffer(device, name, size, value, min, max, step, usage, type);
}