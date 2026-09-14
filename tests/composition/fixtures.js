// Development/test-only observations. Never imported by the app or native module.
export const portraitScene = {
  geometry: { width: 480, height: 640, mirrored: false, rotation: 0 },
  horizon: { angle: 0.1, confidence: 0.95 },
  people: [{ confidence: 0.9, rect: { x: 0.65, y: 0.2, width: 0.25, height: 0.7 } }],
  faces: [{ confidence: 0.9, rect: { x: 0.71, y: 0.23, width: 0.1, height: 0.12 } }],
  subjects: [],
};
export const emptyScene = {
  geometry: portraitScene.geometry, horizon: null, people: [], faces: [],
};
