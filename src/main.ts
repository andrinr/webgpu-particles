import './style.css'

const GRID_SIZE : number = 32;

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

const context : GPUCanvasContext | null = canvas.getContext("webgpu");
if (!context) {
    throw new Error("WebGPU not supported on this browser.");
}

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

const cellShaderModule : GPUShaderModule = device.createShaderModule({
    label: "Cell shader",
    code: `
    @group(0) @binding(0) var<uniform> grid: vec2f;

    @vertex
    fn vertex_main(@location(0) pos: vec2f,
        @builtin(instance_index) instance: u32) ->
        @builtin(position) vec4f {

        let i = f32(instance);
        let cell = vec2f(i % grid.x , floor(i / grid.x));
        let cellOffset = cell / grid * 2;
        let gridPos = (pos + 1) / grid - 1 + cellOffset;
        return vec4f(gridPos, 0, 1);
    }

    @fragment
    fn fragment_main() -> @location(0) vec4f {
        return vec4f(1, 0, 0, 1);
    }
    `
});

const cellPipeline : GPURenderPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: "auto",
    vertex: {
        module: cellShaderModule,
        entryPoint: "vertex_main",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: cellShaderModule,
        entryPoint: "fragment_main", 
        targets: [{
            format: canvasFormat
        }]
    }
});

const bindGroup : GPUBindGroup = device.createBindGroup({
    label: "Cell renderer bind group",
    layout: cellPipeline.getBindGroupLayout(0),
    entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer }
    }],
});

const encoder : GPUCommandEncoder = device.createCommandEncoder();

const pass : GPURenderPassEncoder = encoder.beginRenderPass({
    colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue : [0.5, 0.0, 1.0, 1.0],
        storeOp: "store",
    }]
});

pass.setPipeline(cellPipeline);
pass.setVertexBuffer(0, vertexBuffer);
pass.setBindGroup(0, bindGroup); // New line!
pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // 6 vertices

pass.end();

const commandBuffer : GPUCommandBuffer = encoder.finish();

device.queue.submit([commandBuffer]);

device.queue.submit([encoder.finish()]);
