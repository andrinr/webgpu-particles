import './style.css'
import { setup } from './wgpu/setup';
import { loadCreateShaderModule } from './wgpu/shader';

const WORKGROUP_SIZE : number = 8;
const GRID_SIZE : number = 32;
const UPDATE_INTERVAL = 200;
let step = 0; // Track how many simulation steps have been run

const canvas : HTMLCanvasElement | null = document.querySelector("canvas");
if (!canvas) throw new Error("No canvas found.");

const {device, context, format} = await setup(canvas);

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

for (let i = 0; i < cellStateArray.length; ++i) {
    cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

const vertices : Float32Array = new Float32Array([
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

// Load & create shaders
const vertexShaderModule : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/vertex.wgsl", "Vertex shader");

const fragmentShaderModule : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/fragment.wgsl", "Fragment shader");

const computeShaderModule : GPUShaderModule = 
    await loadCreateShaderModule(device, "/shaders/compute.wgsl", "Simulation shader");

// Bind group layouts
const renderBindGroupLayout : GPUBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
});

const computeBindGroupLayout : GPUBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' },
      },
    ],
});

// Pipeline layouts
const renderPipelineLayout : GPUPipelineLayout = device.createPipelineLayout({
    label: "Cell Pipeline Layout",
    bindGroupLayouts: [ renderBindGroupLayout ],
});

const computePipelineLayout : GPUPipelineLayout = device.createPipelineLayout({
    label: "Cell Pipeline Layout",
    bindGroupLayouts: [ computeBindGroupLayout ],
});

// Pipelines
const renderPipeline : GPURenderPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: renderPipelineLayout,
    vertex: {
        module: vertexShaderModule,
        entryPoint: "main",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: fragmentShaderModule,
        entryPoint: "main", 
        targets: [{
            format: format
        }]
    }
});

const computePipeline : GPUComputePipeline = device.createComputePipeline({
    label: "Simulation pipeline",
    layout: computePipelineLayout,
    compute: {
      module: computeShaderModule,
      entryPoint: "main",
    }
});

// Bind groups
const uniformBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
          offset: 0,
          size: 2 * Uint32Array.BYTES_PER_ELEMENT,
        },
      },
    ],
});

const computeBindGroupA : GPUBindGroup = device.createBindGroup({
    label: "Cell renderer bind group A",
    layout: computeBindGroupLayout,
    entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer }
    },
    {
        binding: 1,
        resource: { buffer: cellStateStorage[0] }
    },
    {
        binding: 2,
        resource: { buffer: cellStateStorage[1] }
    }],
});

const computeBindGroupB : GPUBindGroup = device.createBindGroup({
    label: "Cell renderer bind group B",
    layout: computeBindGroupLayout,
    entries: [{binding: 0,
        resource: { buffer: uniformBuffer }
    },
    {
        binding: 1,
        resource: { buffer: cellStateStorage[1] }
    },
    {
        binding: 2,
        resource: { buffer: cellStateStorage[0] }
    }],
});

const bindGroupsCompute : GPUBindGroup[] = [computeBindGroupA, computeBindGroupB];

function update() : void {
    step++;

    const encoder : GPUCommandEncoder = device.createCommandEncoder();

    const computePass = encoder.beginComputePass();

    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroupsCompute[step % 2]);

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
    
    pass.setPipeline(renderPipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setBindGroup(0, uniformBindGroup); // New line!
    pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // 6 vertices
    
    pass.end();
    
    // const commandBuffer : GPUCommandBuffer = encoder.finish();
    
    // device.queue.submit([commandBuffer]);
    device.queue.submit([encoder.finish()]);
}

setInterval(update, UPDATE_INTERVAL);