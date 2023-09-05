import './style.css'

const WORKGROUP_SIZE : number = 8;
const GRID_SIZE : number = 32;
const UPDATE_INTERVAL = 200; // Update every 200ms (5 times/sec)
let step = 0; // Track how many simulation steps have been run

const canvas : HTMLCanvasElement | null = document.querySelector("canvas");

if (!canvas) {
    throw new Error("No canvas found.");
}

// Your WebGPU code will begin here!
if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}

const adapter : GPUAdapter | null = await navigator.gpu.requestAdapter();
if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}

const device : GPUDevice = await adapter.requestDevice();

const context : GPUCanvasContext = canvas.getContext("webgpu") as GPUCanvasContext;

const canvasFormat : GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device: device,
    format: canvasFormat,
});

// Create a uniform buffer that describes the grid.
const uniformArray : Float32Array = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer : GPUBuffer = device.createBuffer({
    label: "Grid Uniforms",
    size: uniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

// Create an array representing the active state of each cell.
const cellStateArray  : Uint32Array = new Uint32Array(GRID_SIZE * GRID_SIZE);
// Create a storage buffer to hold the cell state.
const cellStateStorage : GPUBuffer[] = [
    device.createBuffer({
        label: "Cell State A",
        size: cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
        label: "Cell State B",
        size: cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
];

// Mark every third cell of the first grid as active.
for (let i = 0; i < cellStateArray.length; i+=3) {
    cellStateArray[i] = 1;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);
  
// Mark every other cell of the second grid as active.
for (let i = 0; i < cellStateArray.length; i++) {
    cellStateArray[i] = i % 2;
}

device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);

const vertices : Float32Array = new Float32Array([
    //   X,    Y,
    -0.8, -0.8, // Triangle 1
    0.8, -0.8,
    0.8,  0.8,
    -0.8, -0.8, // Triangle 2
    0.8,  0.8,
    -0.8,  0.8,
]);

// The buffer is opaque and immutable
const vertexBuffer : GPUBuffer = device.createBuffer({
    label: "Cell vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);

const vertexBufferLayout : GPUVertexBufferLayout = {
    arrayStride: 8, // each vertex is 2 32-bit floats (x, y)
    attributes: [{ // each vertex has only a single attribute
        format: "float32x2",
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
    }],
    stepMode : "vertex",
};

const vertexCodeResponse = await fetch("/shaders/vertex.wgsl");
const vertexShaderString = await vertexCodeResponse.text();

const vertexShaderModule : GPUShaderModule = device.createShaderModule({
    label: "Vertex shader",
    code: vertexShaderString,
});

const fragmentCodeResponse = await fetch("/shaders/fragment.wgsl");
const fragmentShaderString = await fragmentCodeResponse.text();

const fragmentShaderModule : GPUShaderModule = device.createShaderModule({
    label: "Fragment shader",
    code: fragmentShaderString,
});

const simulationCodeResponse = await fetch("/shaders/compute.wgsl");
const simulationShaderString = await simulationCodeResponse.text();

const simulationShaderModule : GPUShaderModule = device.createShaderModule({
    label: "Simulation shader",
    code: simulationShaderString,
});


// Create the bind group layout and pipeline layout.
const bindGroupLayout : GPUBindGroupLayout = device.createBindGroupLayout({
    label: "Cell Bind Group Layout",
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: {} // Grid uniform buffer
    }, {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage"} // Cell state input buffer
    }, {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage"} // Cell state output buffer
    }]
});

const bindGroups : GPUBindGroup[] = [
    device.createBindGroup({
        label: "Cell renderer bind group",
        layout: bindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
        },
        {
            binding: 1,
            resource: { buffer: cellStateStorage[0] }
        }],
    }),
    device.createBindGroup({
        label: "Cell renderer bind group",
        layout: bindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
        },
        {
            binding: 1,
            resource: { buffer: cellStateStorage[1] }
        }],
    }),
];

const pipelineLayout : GPUPipelineLayout = device.createPipelineLayout({
    label: "Cell Pipeline Layout",
    bindGroupLayouts: [ bindGroupLayout ],
});

const cellPipeline : GPURenderPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: pipelineLayout,
    vertex: {
        module: vertexShaderModule,
        entryPoint: "main",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: fragmentShaderModule,
        entryPoint: "main", 
        targets: [{
            format: canvasFormat
        }]
    }
});

const simulationPipeline : GPUComputePipeline = device.createComputePipeline({
    label: "Simulation pipeline",
    layout: pipelineLayout,
    compute: {
      module: simulationShaderModule,
      entryPoint: "computeMain",
    }
});

function update() {
    step++;

    const encoder : GPUCommandEncoder = device.createCommandEncoder();

    const computePass = encoder.beginComputePass();

    computePass.setPipeline(simulationPipeline);
    computePass.setBindGroup(0, bindGroups[step % 2]);

    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

    computePass.end();

    const pass : GPURenderPassEncoder = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue : [0.0, 0.0, 0.0, 1.0],
            storeOp: "store",
        }]
    });
    
    pass.setPipeline(cellPipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setBindGroup(0, bindGroups[step % 2]); // New line!
    pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // 6 vertices
    
    pass.end();
    
    // const commandBuffer : GPUCommandBuffer = encoder.finish();
    
    // device.queue.submit([commandBuffer]);
    device.queue.submit([encoder.finish()]);
}

setInterval(update, UPDATE_INTERVAL);