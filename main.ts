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
const cube = new C3D.Model(cubeMesh, cubeMaterial);

const world = new C3D.Scene();
world.addChild(cube);

const camera = new C3D.PerspectiveCamera(70, 0.1, 100);
camera.position.set(0, 0, 10);
world.addChild(camera);

const renderer = new C3D.Renderer(picture);

game.onUpdate(() => {
  // old Transform built R = Ry * Rx * Rz, which is EulerOrder.YXZ (the default)
  const r = game.runtime() / 4000 * Math.PI;
  cube.rotation.setFromEuler(r, r, r);
  renderer.render(world, camera);
});
