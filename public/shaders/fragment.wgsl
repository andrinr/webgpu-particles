struct FragInput {
  @location(0) vel: vec2f,
};

@fragment
fn main(input: FragInput) -> @location(0) vec4f {
  return vec4f(normalize(input.vel) * 100.0, 1.0, 1.0);
}