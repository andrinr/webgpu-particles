export async function loadCreateShaderModule(
    device : GPUDevice, 
    path : string, 
    label? : string) : Promise<GPUShaderModule> {
    const response = await fetch(path);
    const shaderString = await response.text();

    const shaderModule : GPUShaderModule = device.createShaderModule({
        label: label ?? "Shader",
        code: shaderString,
    });

    return shaderModule;
}