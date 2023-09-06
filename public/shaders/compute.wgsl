@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<uniform> dt: f32;
@group(0) @binding(2) var<storage> particleStateIn: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> particleStateOut: array<vec4f>;

fn particleIndex(id: vec2u) -> u32 {
  return (id.y % u32(grid.y)) * u32(grid.x) + (id.x % u32(grid.x));
}

fn kick_drift_kick(pos: vec2f, vel: vec2f, acc: vec2f) -> vec4f {
  let vel_half = vel + acc * dt * 0.5;
  let pos_full = pos + vel_half * dt;
  let vel_full = vel_half + acc * dt * 0.5;

  return vec4f(pos_full, vel_full);
}

fn force(pos: vec2f, body: vec2f) -> vec2f {
  let r = pos - body;
  let d = length(r) + 0.001;
  return -r * (1.0 / (d * d));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
 
  let i = particleIndex(id.xy);
  let particle_pos = particleStateIn[i].xy;
  let particle_vel = particleStateIn[i].zw;

  let particle_acc = force(particle_pos, vec2f(0., 0.)) * 0.004;

  let new_state = kick_drift_kick(particle_pos, particle_vel, particle_acc);

  particleStateOut[i] = new_state;
}