@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<uniform> dt: f32;
@group(0) @binding(2) var<storage> particeStateIn: array<f32>;
@group(0) @binding(3) var<storage, read_write> particleStateOut: array<f32>;

fn particleIndex(id: vec2u) -> u32 {
  return (id.y % u32(id.y)) * u32(id.x) + (id.x % u32(id.x)) * 4;
}

fn kick_drift_kick(pos: vec2f, vel: vec2f, acc: vec2f) -> vec4f {
  let vel_half = vel + acc * dt * 0.5;
  let pos_full = pos + vel_half * dt;
  let vel_full = vel_half + acc * dt * 0.5;

  return vec4f(pos_full, vel_full);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  // Determine how many active neighbors this cell has.
  
  let i = particleIndex(id.xy);
  let pos = vec2(particeStateIn[i], particeStateIn[i + 1]);
  let vel = vec2(particeStateIn[i + 2], particeStateIn[i + 3]);

  let acc = vec2(0.0, 0.0);

  let new_state = kick_drift_kick(pos, vel, acc);

  particleStateOut[i] = new_state.x;
  particleStateOut[i + 1] = new_state.y;
  particleStateOut[i + 2] = new_state.z;
  particleStateOut[i + 3] = new_state.w;
}