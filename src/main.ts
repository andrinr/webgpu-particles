import './style.css'
import { loadCreateShaderModule } from './wgpu/shader';

const WORKGROUP_SIZE : number = 8;
const GRID_SIZE : number = 32;
const UPDATE_INTERVAL = 200;
let step = 0; // Track how many simulation steps have been run

const canvas : HTMLCanvasElement | null = document.querySelector("canvas");
if (!canvas) throw new Error("No canvas found.");

// Setup
if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}

const adapter : GPUAdapter | null = await navigator.gpu.requestAdapter();
if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}

const device : GPUDevice = await adapter.requestDevice();
const canvasContext : GPUCanvasContext = canvas.getContext("webgpu") as GPUCanvasContext;
const canvasFormat : GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();
canvasContext.configure({
    device: device,
    format: canvasFormat,
});

// Initialize data on host
const uniformArray : Float32Array = new Float32Array([GRID_SIZE, GRID_SIZE]);

const vertices : Float32Array = new Float32Array([
    -0.8, -0.8, // Triangle 1
    0.8, -0.8,
    0.8,  0.8,
    -0.8, -0.8, // Triangle 2
    0.8,  0.8,
    -0.8,  0.8,
]);

const cellStateArray  : Uint32Array = new Uint32Array(GRID_SIZE * GRID_SIZE);
for (let i = 0; i < cellStateArray.length; ++i) {
    cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
}

// Create Buffers
const uniformBuffer : GPUBuffer = device.createBuffer({
    label: "Grid Uniforms",
    size: uniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const vertexBuffer : GPUBuffer = device.createBuffer({
    label: "Cell vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const cellStateBuffers : GPUBuffer[] = [
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

// Copy data from host to device
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);
device.queue.writeBuffer(vertexBuffer, 0, vertices);
device.queue.writeBuffer(cellStateBuffers[0], 0, cellStateArray);
device.queue.writeBuffer(cellStateBuffers[1], 0, cellStateArray);

// Define vertex buffer layout
const vertexBufferLayout : GPUVertexBufferLayout = {
    arrayStride: 8, // each vertex is 2 32-bit floats (x, y)
    attributes: [{ // each vertex has only a single attribute
        format: "float32x2",
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
    }],
    stepMode : "vertex",
};

// Load & create shaders
const vertexShaderModule : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/vertex.wgsl", "Vertex shader");

const fragmentShaderModule : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/fragment.wgsl", "Fragment shader");

const computeShaderModule : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/compute.wgsl", "Simulation shader");

// Bind group layouts, can be used for both pipelines
const bindGroupLayout : GPUBindGroupLayout = device.createBindGroupLayout({
    label: "Bind group layout",
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type : "uniform"} // Grid uniform buffer
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

// Bind groups: Connect buffer to shader, can be used for both pipelines
const bindGroups : GPUBindGroup[] = [
    device.createBindGroup({
        label: "Renderer bind group A",
        layout: bindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
        }, {
            binding: 1,
            resource: { buffer: cellStateBuffers[0] }
        }, {
            binding: 2,
            resource: { buffer: cellStateBuffers[1] }
        }],
      }),
    device.createBindGroup({
        label: "Renderer bind group B",
        layout: bindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
        }, {
            binding: 1,
            resource: { buffer: cellStateBuffers[1] }
        }, {
            binding: 2,
            resource: { buffer: cellStateBuffers[0] }
        }],
    })
]

// Pipeline layouts, can be used for both pipelines
const pipelineLayout : GPUPipelineLayout = device.createPipelineLayout({
    label: "Renderer Pipeline Layout",
    bindGroupLayouts: [ bindGroupLayout ],
});

// Pipelines
const renderPipeline : GPURenderPipeline = device.createRenderPipeline({
    label: "Renderer pipeline",
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

const computePipeline = device.createComputePipeline({
    label: "Compute pipeline",
    layout: pipelineLayout,
    compute: {
        module: computeShaderModule,
        entryPoint: "main",
    }
});

function update() : void {
    step++;

    console.log("Step " + step);

    const encoder : GPUCommandEncoder = device.createCommandEncoder();

    const computePass = encoder.beginComputePass();

    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroups[step % 2]);

    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

    computePass.end();

    const renderPass : GPURenderPassEncoder = encoder.beginRenderPass({
        colorAttachments: [{
            view: canvasContext.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue : [0.0, 0.0, 0.0, 1.0],
            storeOp: "store",
        }]
    });
    
    renderPass.setPipeline(renderPipeline);
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.setBindGroup(0, bindGroups[step % 2]); // New line!
    renderPass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // 6 vertices
    
    renderPass.end();
    
    device.queue.submit([encoder.finish()]);
}

setInterval(update, UPDATE_INTERVAL);