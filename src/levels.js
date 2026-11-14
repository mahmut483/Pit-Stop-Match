// Seviyeler: tür listesi (her tür 3 adet), dağınıklık parçaları, kir kategorileri, yardımcı hakları.
const L1 = ["wrench", "oilCan", "tire", "teaGlass", "sparkPlug", "cone"];
const L2 = [...L1, "hammer", "oilFilter", "simit", "battery"];
const L3 = [...L2, "screwdriver", "pliers", "teapot", "sprayCan", "hubcap", "jerrycan"];
const L4 = [...L3, "gear", "boltJar", "radio", "flashlight", "funnel", "antifreeze", "steeringWheel", "extinguisher"];
const L5 = [...L4, "tapeRoll", "gloves", "jack", "clock", "plate", "tavla", "mop", "roller", "sponge", "rag"];

const M1 = ["stool1", "stool2"];
const M2 = [...M1, "drawer2", "hood"];
const M3 = [...M2, "drawer1", "drawer3", "pegboard", "wheel", "barrel"];
const M4 = [...M3, "drawer4", "poster", "shelf3"];

export const LEVELS = [
  { id: "L1", title: "Morning opening", seed: 101, undo: 3, hint: 3, shuffle: 1, types: L1, mess: M1, dirt: [] },
  { id: "L2", title: "Hood left open", seed: 202, undo: 2, hint: 2, shuffle: 1, types: L2, mess: M2, dirt: [] },
  { id: "L3", title: "Missing wheel", seed: 303, undo: 2, hint: 2, shuffle: 1, types: L3, mess: M3, dirt: [] },
  { id: "L4", title: "Busy day", seed: 404, undo: 2, hint: 2, shuffle: 2, types: L4, mess: M4, dirt: [] },
  { id: "L5", title: "Big clean-up", seed: 505, undo: 3, hint: 3, shuffle: 2, types: L5, mess: M4, dirt: ["floor", "wall", "counter", "furniture"] },
];
