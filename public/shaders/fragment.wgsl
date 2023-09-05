struct FragInput {
  @location(0) cell: vec2f,
};

@group(0) @binding(0) var<uniform> grid: vec2f;

@fragment
fn main(input: FragInput) -> @location(0) vec4f {
    return vec4f(input.cell/grid, 1.0, 1);
}