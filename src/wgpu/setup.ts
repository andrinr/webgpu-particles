export async function setup(canvas : HTMLCanvasElement) 
    : Promise<{device : GPUDevice, context : GPUCanvasContext, format : GPUTextureFormat}> {

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

    return {
        device: device,
        context: context,
        format: canvasFormat,
    };
}