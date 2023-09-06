struct VertexInput {
  @location(0) pos: vec2f,
  @builtin(instance_index) instance: u32,
};

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) cell: vec2f,
};

@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<uniform> dt: f32;
@group(0) @binding(2) var<storage> particleState: array<f32>;

@vertex
fn main(
  @location(0) pos: vec2f,
  @builtin(instance_index) instance: u32) -> VertexOutput {

  let state_pos = vec2f(
    particleState[instance * 4 + 0],
    particleState[instance * 4 + 1]);

  var output: VertexOutput;
  output.pos = vec4f(state_pos, 0, 1);
  output.cell = vec2f(1.0, 1.0);
  return output;
}