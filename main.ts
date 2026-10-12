// any code below is temporarily here, will be moved into separate files later

game.consoleOverlay.setVisible(true);
game.stats = true;

// single rotating cube, ported from docs/old_main.ts

// 8 unique corners, 3 numbers each
const CUBE_POSITIONS = [
  -1, -1, -1,  // 0  back  bottom left
  1, -1, -1,   // 1  back  bottom right
  1, 1, -1,    // 2  back  top    right
  -1, 1, -1,   // 3  back  top    left
  -1, -1, 1,   // 4  front bottom left
  1, -1, 1,    // 5  front bottom right
  1, 1, 1,     // 6  front top    right
  -1, 1, 1     // 7  front top    left
];
// 12 triangles, 3 indices each, CCW from outside
const CUBE_INDICES = [
  4, 5, 6, 4, 6, 7,  // front  (+Z)
  0, 3, 2, 0, 2, 1,  // back   (-Z)
  0, 4, 7, 0, 7, 3,  // left   (-X)
  1, 2, 6, 1, 6, 5,  // right  (+X)
  3, 7, 6, 3, 6, 2,  // top    (+Y)
  0, 1, 5, 0, 5, 4   // bottom (-Y)
];
// one palette index per triangle
const CUBE_COLORS = [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7];

const picture = image.create(scene.screenWidth(), scene.screenHeight());
scene.setBackgroundImage(picture);

const cubeMesh = new C3D.Mesh(CUBE_POSITIONS, CUBE_INDICES);
const cubeMaterial = new C3D.FaceColorMaterial(CUBE_COLORS);
const cube1 = new C3D.Model(cubeMesh, cubeMaterial);
const cube2 = new C3D.Model(cubeMesh, cubeMaterial);
cube2.position.set(1, 0, 0);
cube2.scale.set(-1, 1, 1);

const world = new C3D.Scene();
world.addChild(cube1);
world.addChild(cube2);

const camera = new C3D.PerspectiveCamera(70, 0.1, 100);
camera.position.set(0, 0, 4);
world.addChild(camera);

const renderer = new C3D.Renderer(picture);

// fly camera: p1 moves (up/down = forward/back, left/right = strafe,
// A/B = rise/fall),
// p2 looks (up/down = pitch, left/right = yaw)
const CAMERA_MOVE_SPEED = 3;  // units per second
const CAMERA_TURN_SPEED = Math.PI / 2;  // radians per second
const CAMERA_MAX_PITCH = Math.PI / 2 - 0.01;  // stop just short of straight up/down
let cameraYaw = 0;
let cameraPitch = 0;

function updateCamera(dt: number) {
  if (controller.player2.left.isPressed()) cameraYaw += CAMERA_TURN_SPEED * dt;
  if (controller.player2.right.isPressed()) cameraYaw -= CAMERA_TURN_SPEED * dt;
  if (controller.player2.up.isPressed()) cameraPitch += CAMERA_TURN_SPEED * dt;
  if (controller.player2.down.isPressed()) cameraPitch -= CAMERA_TURN_SPEED * dt;
  cameraPitch = Math.max(-CAMERA_MAX_PITCH, Math.min(CAMERA_MAX_PITCH, cameraPitch));
  // YXZ = yaw about world Y, then pitch about the local X, no roll
  camera.rotation.setFromEuler(cameraPitch, cameraYaw, 0);

  // the camera looks down its local -Z, so yawing that by cameraYaw gives
  // forward = (-sin, 0, -cos) and right = (cos, 0, -sin), kept level so
  // pitching doesn't change the movement plane
  let forward = 0;
  let strafe = 0;
  if (controller.player1.up.isPressed()) forward += 1;
  if (controller.player1.down.isPressed()) forward -= 1;
  if (controller.player1.right.isPressed()) strafe += 1;
  if (controller.player1.left.isPressed()) strafe -= 1;
  const step = CAMERA_MOVE_SPEED * dt;
  const s = Math.sin(cameraYaw);
  const c = Math.cos(cameraYaw);
  camera.position.x += (-s * forward + c * strafe) * step;
  camera.position.z += (-c * forward - s * strafe) * step;
  // A/B rise/fall straight along world Y, regardless of where the camera looks
  if (controller.player1.A.isPressed()) camera.position.y += step;
  if (controller.player1.B.isPressed()) camera.position.y -= step;
}

game.onUpdate(() => {
  updateCamera(game.currentScene().eventContext.deltaTime);
  // old Transform built R = Ry * Rx * Rz, which is EulerOrder.YXZ (the default)
  const r = game.runtime() / 8000 * Math.PI;
  cube1.rotation.setFromEuler(r, r, r);
  renderer.render(world, camera);
});
