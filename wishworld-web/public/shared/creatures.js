// Mirrors the Unity creature library (source: Assets/WishWorld/Editor/Builder.Worlds.cs, saved by the builder to
// Assets/WishWorld/Definitions/Creatures/<id>.asset, Definitions/Worlds/<id>.asset and Resources/WorldLibrary.asset).
// Keep ids identical to Unity option ids.
// Written from commit f1b6111. The full reference, with sources for every value, is docs/UNITY_PARITY.md.
//
// How to read this file:
// - A line ending in "// web-only" holds a value Unity does not have (habitat, emoji); everything else is Unity's.
// - The sea world's Unity id is "aquarium". There is no "reef" id ("reef" is one of the aquarium's keywords).
// - motion is Unity's MoveType: "swim" | "fly" | "walk" | "float" | "orbit". Unity has no "hover".
//     float: stays at one spot on its ring, bobs and slowly spins. Unity never uses `speed` for these.
//     orbit: the planets; they circle a point 3.2 m in front of the player (0.85 m in AR) at radius ring[0].
//     walk:  paces back and forth over a short arc at height 0; `speed` is its top speed.
//   move repeats motion: it is the field name /shared/models.js and /shared/movement.js read.
// - size is the longest side of the model in metres at Unity scale 1 (how it looks inside a VR world).
//   In the real room (AR) Unity multiplies the model by arScale, so the AR size is size * arScale.
// - dims is the model's bounding box [x, y, z] in metres (x = right, y = up, z = forward; models face +z).
// - ring is the distance from the player it keeps to [min, max] in metres; height is [min, max] above the floor.
// - count is how many the creature's own world starts with; addCount is how many a wish adds.
// - keywords[0] is the word the wish menu and the AI use for the creature. It differs from the id for
//   trex ("t rex"), polarbear ("polar bear"), snowyowl ("snowy owl") and balloon ("hot air balloon").
// - color is the model's main body colour. Facts are Unity's own text; Unity marks all of them as not yet fact-checked.
// - unity.source: "generated" = built in code (CreatureMeshes.cs); "pack" = third-party CC0 model baked to vertex colours.

export const CREATURES = [
  // ---- aquarium
  {
    id: "clownfish", name: "Clownfish", keywords: ["clownfish", "flying fish", "fish"],
    habitat: "water", emoji: "🐠", // web-only
    model: "/models/clownfish.glb",
    size: 0.18, // longest side in metres; AR size 0.18
    speed: 0.35, motion: "swim", move: "swim",
    color: "#fa7a1a",
    fact: "Clownfish live among the stinging arms of sea anemones, which do not hurt them.",
    world: "aquarium",
    quiz: "Which fish makes its home in a sea anemone?",
    count: 8, addCount: 8, schooling: true, ring: [1.3, 2.4], height: [1, 1.7], arScale: 1, voicePitch: 1.8,
    dims: [0.08, 0.099, 0.182], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Clownfish.prefab", source: "generated" },
  },
  {
    id: "turtle", name: "Sea Turtle", keywords: ["turtle", "sea turtle"],
    habitat: "water", emoji: "🐢", // web-only
    model: "/models/turtle.glb",
    size: 1.1, // longest side in metres; AR size 0.55
    speed: 0.25, motion: "swim", move: "swim",
    color: "#4d854d",
    fact: "Sea turtles swim back to the beach where they hatched to lay their own eggs.",
    world: "aquarium",
    quiz: "Which animal returns to the beach where it hatched to lay its eggs?",
    count: 1, addCount: 1, schooling: false, ring: [2, 3.4], height: [0.9, 1.8], arScale: 0.5, voicePitch: 0.8,
    dims: [1.102, 0.27, 0.93], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_SeaTurtle.prefab", source: "generated" },
  },
  {
    id: "shark", name: "Shark", keywords: ["shark"],
    habitat: "water", emoji: "🦈", // web-only
    model: "/models/shark.glb",
    size: 1.97, // longest side in metres; AR size 0.69
    speed: 0.5, motion: "swim", move: "swim",
    color: "#6b8099",
    fact: "A shark has no bones. Its skeleton is made of cartilage, the bendy stuff in your ears.",
    world: "aquarium",
    quiz: "Which animal has a skeleton of cartilage and no bones?",
    count: 1, addCount: 1, schooling: false, ring: [3.6, 5.4], height: [1.2, 2.4], arScale: 0.35, voicePitch: 0.5,
    dims: [1.122, 0.846, 1.971], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Shark.prefab", source: "generated" },
  },
  {
    id: "jellyfish", name: "Jellyfish", keywords: ["jellyfish", "jelly"],
    habitat: "water", emoji: "🪼", // web-only (a Unicode 15 emoji; swap it for the wind chime, U+1F390, if a device shows a box)
    model: "/models/jellyfish.glb",
    size: 0.6, // longest side in metres; AR size 0.48
    speed: 0.1, motion: "float", move: "float", // Unity does not move float creatures; speed is unused there
    color: "#f58fc7",
    fact: "Jellyfish have no brain, no heart and no bones.",
    world: "aquarium",
    quiz: "Which sea animal has no brain and no heart?",
    count: 4, addCount: 3, schooling: false, ring: [1.4, 3], height: [1, 2.2], arScale: 0.8, voicePitch: 1.5,
    dims: [0.34, 0.6, 0.35], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Jellyfish.prefab", source: "generated" },
  },
  {
    id: "ray", name: "Ray", keywords: ["ray", "stingray", "manta ray", "manta"],
    habitat: "water", emoji: "🐟", // web-only
    model: "/models/ray.glb",
    size: 1.42, // longest side in metres; AR size 0.64
    speed: 0.35, motion: "swim", move: "swim",
    color: "#475c85",
    fact: "Rays swim by flapping their wide fins like wings.",
    world: "aquarium",
    quiz: "Which sea animal swims by flapping its fins like wings?",
    count: 1, addCount: 1, schooling: false, ring: [2.6, 4.4], height: [0.6, 1.2], arScale: 0.45, voicePitch: 0.7,
    dims: [1.14, 0.135, 1.42], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Ray.prefab", source: "generated" },
  },
  // ---- zoo
  {
    id: "elephant", name: "Elephant", keywords: ["elephant"],
    habitat: "land", emoji: "🐘", // web-only
    model: "/models/elephant.glb",
    size: 3.72, // longest side in metres; AR size 0.45
    speed: 0.3, motion: "walk", move: "walk",
    color: "#9ea3b0",
    fact: "An elephant's trunk has no bones in it. It is all muscle.",
    world: "zoo",
    quiz: "Which animal has a long nose with no bones in it?",
    count: 1, addCount: 1, schooling: false, ring: [4.8, 5.8], height: [0, 0], arScale: 0.12, voicePitch: 0.45,
    dims: [1.35, 2.654, 3.723], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Elephant.prefab", source: "generated" },
  },
  {
    id: "giraffe", name: "Giraffe", keywords: ["giraffe"],
    habitat: "land", emoji: "🦒", // web-only
    model: "/models/giraffe.glb",
    size: 4.54, // longest side in metres; AR size 0.45
    speed: 0.3, motion: "walk", move: "walk",
    color: "#f2cc6b",
    fact: "A giraffe's long neck has seven bones, the same number as your neck.",
    world: "zoo",
    quiz: "Which animal's long neck has seven bones, just like yours?",
    count: 1, addCount: 1, schooling: false, ring: [4.8, 5.9], height: [0, 0], arScale: 0.1, voicePitch: 0.9,
    dims: [0.8, 4.542, 2.287], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Giraffe.prefab", source: "generated" },
  },
  {
    id: "zebra", name: "Zebra", keywords: ["zebra"],
    habitat: "land", emoji: "🦓", // web-only
    model: "/models/zebra.glb",
    size: 1.89, // longest side in metres; AR size 0.38
    speed: 0.4, motion: "walk", move: "walk",
    color: "#e6e6e6",
    fact: "Every zebra has its own stripe pattern. No two are the same.",
    world: "zoo",
    quiz: "Which animal has stripes that are different on every one?",
    count: 2, addCount: 1, schooling: false, ring: [3, 4.5], height: [0, 0], arScale: 0.2, voicePitch: 1.1,
    dims: [0.525, 1.45, 1.893], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/Model_Zebra.prefab", source: "pack" },
  },
  {
    id: "lion", name: "Lion", keywords: ["lion"],
    habitat: "land", emoji: "🦁", // web-only
    model: "/models/lion.glb",
    size: 2.1, // longest side in metres; AR size 0.46
    speed: 0.35, motion: "walk", move: "walk",
    color: "#e0ad5c",
    fact: "A lion's roar can be heard from several kilometres away.",
    world: "zoo",
    quiz: "Whose roar can be heard from kilometres away?",
    count: 1, addCount: 1, schooling: false, ring: [3, 4.5], height: [0, 0], arScale: 0.22, voicePitch: 0.55,
    dims: [0.684, 1.496, 2.096], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Lion.prefab", source: "generated" },
  },
  {
    id: "flamingo", name: "Flamingo", keywords: ["flamingo"],
    habitat: "land", emoji: "🦩", // web-only
    model: "/models/flamingo.glb",
    size: 1.36, // longest side in metres; AR size 0.41
    speed: 0.2, motion: "walk", move: "walk",
    color: "#fa8ca6",
    fact: "Flamingos are pink because of the food they eat.",
    world: "zoo",
    quiz: "Which bird turns pink because of its food?",
    count: 3, addCount: 3, schooling: false, ring: [2, 3.4], height: [0, 0], arScale: 0.3, voicePitch: 1.4,
    dims: [0.247, 1.365, 0.645], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Flamingo.prefab", source: "generated" },
  },
  // ---- space
  {
    id: "saturn", name: "Saturn", keywords: ["saturn", "planet"],
    habitat: "air", emoji: "🪐", // web-only
    model: "/models/saturn.glb",
    size: 1.25, // longest side in metres; AR size 0.38
    speed: 0.22, motion: "orbit", move: "orbit",
    color: "#cb9157",
    fact: "Saturn's rings are made mostly of pieces of ice.",
    world: "space",
    quiz: "Which planet has rings made mostly of ice?",
    count: 1, addCount: 1, schooling: false, ring: [1.7, 1.7], height: [0, 0], arScale: 0.3, voicePitch: 0.6,
    dims: [1.25, 0.745, 1.158], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/Model_Saturn.prefab", source: "pack" },
  },
  {
    id: "earth", name: "Earth", keywords: ["earth", "planet"],
    habitat: "air", emoji: "🌍", // web-only
    model: "/models/earth.glb",
    size: 0.53, // longest side in metres; AR size 0.16
    speed: 0.3, motion: "orbit", move: "orbit",
    color: "#3373e0",
    fact: "More than two thirds of the Earth is covered by ocean.",
    world: "space",
    quiz: "Which planet is mostly covered by ocean?",
    count: 1, addCount: 1, schooling: false, ring: [1.2, 1.2], height: [0, 0], arScale: 0.3, voicePitch: 0.8,
    dims: [0.533, 0.52, 0.496], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Earth.prefab", source: "generated" },
  },
  {
    id: "venus", name: "Venus", keywords: ["venus", "planet"],
    habitat: "air", emoji: "🌕", // web-only
    model: "/models/venus.glb",
    size: 0.46, // longest side in metres; AR size 0.14
    speed: 0.35, motion: "orbit", move: "orbit",
    color: "#f2d694",
    fact: "A day on Venus is longer than its year.",
    world: "space",
    quiz: "On which planet is a day longer than a year?",
    count: 1, addCount: 1, schooling: false, ring: [0.75, 0.75], height: [0, 0], arScale: 0.3, voicePitch: 1,
    dims: [0.457, 0.46, 0.446], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Venus.prefab", source: "generated" },
  },
  {
    id: "astronaut", name: "Astronaut", keywords: ["astronaut"],
    habitat: "air", emoji: "🧑‍🚀", // web-only
    model: "/models/astronaut.glb",
    size: 1.34, // longest side in metres; AR size 0.34
    speed: 0.1, motion: "float", move: "float", // Unity does not move float creatures; speed is unused there
    color: "#f7f7f7",
    fact: "Astronauts in orbit float because they are falling around the Earth all the time.",
    world: "space",
    quiz: "Who floats while circling the Earth?",
    count: 1, addCount: 1, schooling: false, ring: [2, 3.4], height: [1, 2], arScale: 0.25, voicePitch: 1.2,
    dims: [0.782, 1.342, 0.507], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Astronaut.prefab", source: "generated" },
  },
  {
    id: "rocket", name: "Rocket", keywords: ["rocket", "rocket ship"],
    habitat: "air", emoji: "🚀", // web-only
    model: "/models/rocket.glb",
    size: 2.5, // longest side in metres; AR size 0.5
    speed: 0.7, motion: "fly", move: "fly",
    color: "#f7f7f7",
    fact: "To stay in orbit, a rocket has to reach about 28,000 kilometres an hour.",
    world: "space",
    quiz: "What must reach about 28,000 kilometres an hour to stay in orbit?",
    count: 1, addCount: 1, schooling: false, ring: [3.6, 5], height: [1.6, 3], arScale: 0.2, voicePitch: 0.4,
    dims: [0.995, 0.862, 2.5], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Rocket.prefab", source: "generated" },
  },
  {
    id: "satellite", name: "Satellite", keywords: ["satellite"],
    habitat: "air", emoji: "🛰️", // web-only
    model: "/models/satellite.glb",
    size: 2.45, // longest side in metres; AR size 0.61
    speed: 0.1, motion: "float", move: "float", // Unity does not move float creatures; speed is unused there
    color: "#ebbf4d",
    fact: "Satellites circle the Earth. Some help phones and maps know where you are.",
    world: "space",
    quiz: "What circles the Earth and helps maps know where you are?",
    count: 1, addCount: 1, schooling: false, ring: [2.6, 4], height: [1.8, 2.8], arScale: 0.25, voicePitch: 2,
    dims: [2.45, 0.65, 0.66], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Satellite.prefab", source: "generated" },
  },
  {
    id: "comet", name: "Comet", keywords: ["comet"],
    habitat: "air", emoji: "☄️", // web-only
    model: "/models/comet.glb",
    size: 1.57, // longest side in metres; AR size 0.63
    speed: 0.9, motion: "fly", move: "fly",
    color: "#c7ebff",
    fact: "A comet is a ball of ice and dust. Its tail always points away from the Sun.",
    world: "space",
    quiz: "What is a ball of ice and dust with a long tail?",
    count: 1, addCount: 1, schooling: false, ring: [4, 5.5], height: [2, 3.2], arScale: 0.4, voicePitch: 2.4,
    dims: [0.36, 0.36, 1.575], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Comet.prefab", source: "generated" },
  },
  // ---- dinosaurs
  {
    id: "trex", name: "T. rex", keywords: ["t rex", "trex", "tyrannosaurus", "rex"],
    habitat: "land", emoji: "🦖", // web-only
    model: "/models/trex.glb",
    size: 5.79, // longest side in metres; AR size 0.58
    speed: 0.35, motion: "walk", move: "walk",
    color: "#5c8f52",
    fact: "T. rex lived closer in time to you than to Stegosaurus.",
    world: "dinosaurs",
    quiz: "Which dinosaur lived closer in time to you than to Stegosaurus?",
    count: 1, addCount: 1, schooling: false, ring: [5.2, 5.9], height: [0, 0], arScale: 0.1, voicePitch: 0.35,
    dims: [1.34, 3.625, 5.787], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Trex.prefab", source: "generated" },
  },
  {
    id: "triceratops", name: "Triceratops", keywords: ["triceratops"],
    habitat: "land", emoji: "🦕", // web-only
    model: "/models/triceratops.glb",
    size: 5.09, // longest side in metres; AR size 0.61
    speed: 0.25, motion: "walk", move: "walk",
    color: "#c7854d",
    fact: "The name Triceratops means three-horned face.",
    world: "dinosaurs",
    quiz: "Which dinosaur's name means three-horned face?",
    count: 1, addCount: 1, schooling: false, ring: [4.6, 5.6], height: [0, 0], arScale: 0.12, voicePitch: 0.5,
    dims: [1.5, 2.689, 5.09], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Triceratops.prefab", source: "generated" },
  },
  {
    id: "stegosaurus", name: "Stegosaurus", keywords: ["stegosaurus"],
    habitat: "land", emoji: "🦕", // web-only
    model: "/models/stegosaurus.glb",
    size: 5.25, // longest side in metres; AR size 0.63
    speed: 0.25, motion: "walk", move: "walk",
    color: "#859e57",
    fact: "Stegosaurus had two rows of bony plates along its back.",
    world: "dinosaurs",
    quiz: "Which dinosaur had bony plates along its back?",
    count: 1, addCount: 1, schooling: false, ring: [4.6, 5.8], height: [0, 0], arScale: 0.12, voicePitch: 0.6,
    dims: [1.1, 2.839, 5.251], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Stegosaurus.prefab", source: "generated" },
  },
  {
    id: "pterosaur", name: "Pterosaur", keywords: ["pterosaur", "pterodactyl"],
    habitat: "air", emoji: "🦅", // web-only
    model: "/models/pterosaur.glb",
    size: 2.84, // longest side in metres; AR size 0.57
    speed: 0.9, motion: "fly", move: "fly",
    color: "#b26b52",
    fact: "Pterosaurs were flying reptiles. They were not dinosaurs.",
    world: "dinosaurs",
    quiz: "Which flying reptile was not really a dinosaur?",
    count: 2, addCount: 2, schooling: false, ring: [4, 5.5], height: [2.6, 3.6], arScale: 0.2, voicePitch: 1.6,
    dims: [2.84, 0.476, 1.719], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Pterosaur.prefab", source: "generated" },
  },
  // ---- arctic
  {
    id: "penguin", name: "Penguin", keywords: ["penguin"],
    habitat: "land", emoji: "🐧", // web-only
    model: "/models/penguin.glb",
    size: 0.9, // longest side in metres; AR size 0.36
    speed: 0.2, motion: "walk", move: "walk",
    color: "#14141a",
    fact: "Penguins live in the south and polar bears in the north, so they never meet in the wild.",
    world: "arctic",
    quiz: "Which bird lives in the south and never meets a polar bear?",
    count: 4, addCount: 3, schooling: false, ring: [1.8, 3], height: [0, 0], arScale: 0.4, voicePitch: 1.5,
    dims: [0.65, 0.9, 0.49], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Penguin.prefab", source: "generated" },
  },
  {
    id: "polarbear", name: "Polar Bear", keywords: ["polar bear", "bear"],
    habitat: "land", emoji: "🐻‍❄️", // web-only
    model: "/models/polarbear.glb",
    size: 2.5, // longest side in metres; AR size 0.45
    speed: 0.3, motion: "walk", move: "walk",
    color: "#f7f7f0",
    fact: "Under its white fur, a polar bear's skin is black.",
    world: "arctic",
    quiz: "Which animal has black skin under white fur?",
    count: 1, addCount: 1, schooling: false, ring: [3.6, 5], height: [0, 0], arScale: 0.18, voicePitch: 0.5,
    dims: [0.85, 1.615, 2.496], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_PolarBear.prefab", source: "generated" },
  },
  {
    id: "seal", name: "Seal", keywords: ["seal"],
    habitat: "land", emoji: "🦭", // web-only
    model: "/models/seal.glb",
    size: 1.82, // longest side in metres; AR size 0.46
    speed: 0.12, motion: "walk", move: "walk",
    color: "#858f9e",
    fact: "Seals have a thick layer of fat called blubber that keeps them warm.",
    world: "arctic",
    quiz: "Which animal keeps warm with a layer of blubber?",
    count: 1, addCount: 1, schooling: false, ring: [2.6, 4], height: [0, 0], arScale: 0.25, voicePitch: 0.9,
    dims: [0.934, 0.698, 1.821], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Seal.prefab", source: "generated" },
  },
  {
    id: "whale", name: "Blue Whale", keywords: ["whale", "blue whale"],
    habitat: "water", emoji: "🐋", // web-only
    model: "/models/whale.glb",
    size: 3.98, // longest side in metres; AR size 0.48
    speed: 0.4, motion: "swim", move: "swim",
    color: "#3d66a8",
    fact: "The blue whale is the largest animal that has ever lived.",
    world: "arctic",
    quiz: "Which is the largest animal that has ever lived?",
    count: 1, addCount: 1, schooling: false, ring: [5.6, 6], height: [2.6, 3.4], arScale: 0.12, voicePitch: 0.3,
    dims: [1.942, 1.09, 3.981], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_BlueWhale.prefab", source: "generated" },
  },
  {
    id: "snowyowl", name: "Snowy Owl", keywords: ["snowy owl", "owl"],
    habitat: "air", emoji: "🦉", // web-only
    model: "/models/snowyowl.glb",
    size: 1.14, // longest side in metres; AR size 0.57
    speed: 0.8, motion: "fly", move: "fly",
    color: "#f7f7f7",
    fact: "Unlike most owls, snowy owls often hunt in the daytime.",
    world: "arctic",
    quiz: "Which owl often hunts in the daytime?",
    count: 1, addCount: 1, schooling: false, ring: [2.6, 4.4], height: [1.8, 3], arScale: 0.5, voicePitch: 1.3,
    dims: [1.144, 0.38, 0.815], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_SnowyOwl.prefab", source: "generated" },
  },
  // ---- rainforest
  {
    id: "parrot", name: "Parrot", keywords: ["parrot"],
    habitat: "air", emoji: "🦜", // web-only
    model: "/models/parrot.glb",
    size: 0.95, // longest side in metres; AR size 0.57
    speed: 0.8, motion: "fly", move: "fly",
    color: "#e53329",
    fact: "Parrots can copy sounds, even human words.",
    world: "rainforest",
    quiz: "Which bird can copy human words?",
    count: 2, addCount: 2, schooling: false, ring: [2, 4], height: [1.6, 2.8], arScale: 0.6, voicePitch: 1.9,
    dims: [0.728, 0.274, 0.951], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Parrot.prefab", source: "generated" },
  },
  {
    id: "monkey", name: "Monkey", keywords: ["monkey"],
    habitat: "land", emoji: "🐒", // web-only
    model: "/models/monkey.glb",
    size: 0.88, // longest side in metres; AR size 0.26
    speed: 0.35, motion: "walk", move: "walk",
    color: "#805738",
    fact: "Some monkeys, like spider monkeys, can hang from a branch by their tails.",
    world: "rainforest",
    quiz: "Which animal can hang from a branch by its tail?",
    count: 1, addCount: 1, schooling: false, ring: [2.5, 4], height: [0, 0], arScale: 0.3, voicePitch: 1.6,
    dims: [0.481, 0.877, 0.65], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Monkey.prefab", source: "generated" },
  },
  {
    id: "frog", name: "Tree Frog", keywords: ["frog", "tree frog"],
    habitat: "land", emoji: "🐸", // web-only
    model: "/models/frog.glb",
    size: 0.35, // longest side in metres; AR size 0.28
    speed: 0.1, motion: "walk", move: "walk",
    color: "#4dc752",
    fact: "Poison dart frogs wear bright colours to warn that they are poisonous.",
    world: "rainforest",
    quiz: "Which animal uses bright colours as a warning?",
    count: 2, addCount: 2, schooling: false, ring: [1.3, 2.2], height: [0, 0], arScale: 0.8, voicePitch: 2.2,
    dims: [0.35, 0.198, 0.284], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_TreeFrog.prefab", source: "generated" },
  },
  {
    id: "butterfly", name: "Butterfly", keywords: ["butterfly"],
    habitat: "air", emoji: "🦋", // web-only
    model: "/models/butterfly.glb",
    size: 0.2, // longest side in metres; AR size 0.2
    speed: 0.3, motion: "fly", move: "fly",
    color: "#fa8c1f",
    fact: "Butterflies taste with their feet.",
    world: "rainforest",
    quiz: "Which insect tastes with its feet?",
    count: 6, addCount: 8, schooling: false, ring: [1.2, 2.5], height: [1, 1.9], arScale: 1, voicePitch: 2.6,
    dims: [0.199, 0.04, 0.122], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Butterfly.prefab", source: "generated" },
  },
  {
    id: "sloth", name: "Sloth", keywords: ["sloth"],
    habitat: "air", emoji: "🦥", // web-only
    model: "/models/sloth.glb",
    size: 1.1, // longest side in metres; AR size 0.44
    speed: 0.05, motion: "float", move: "float", // Unity does not move float creatures; speed is unused there
    color: "#a89475",
    fact: "Sloths move so slowly that green algae grows in their fur.",
    world: "rainforest",
    quiz: "Which animal moves so slowly that algae grows in its fur?",
    count: 1, addCount: 1, schooling: false, ring: [2.5, 3.5], height: [2, 2.6], arScale: 0.4, voicePitch: 0.7,
    dims: [1.1, 0.89, 0.43], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Sloth.prefab", source: "generated" },
  },
  // ---- farm
  {
    id: "cow", name: "Cow", keywords: ["cow"],
    habitat: "land", emoji: "🐄", // web-only
    model: "/models/cow.glb",
    size: 2.58, // longest side in metres; AR size 0.47
    speed: 0.2, motion: "walk", move: "walk",
    color: "#e6e6e6",
    fact: "A cow's stomach has four parts.",
    world: "farm",
    quiz: "Which farm animal has a stomach with four parts?",
    count: 1, addCount: 1, schooling: false, ring: [3, 4.5], height: [0, 0], arScale: 0.18, voicePitch: 0.5,
    dims: [0.639, 1.45, 2.584], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/Model_Cow.prefab", source: "pack" },
  },
  {
    id: "sheep", name: "Sheep", keywords: ["sheep", "lamb"],
    habitat: "land", emoji: "🐑", // web-only
    model: "/models/sheep.glb",
    size: 1.29, // longest side in metres; AR size 0.32
    speed: 0.2, motion: "walk", move: "walk",
    color: "#e6e6e6",
    fact: "A sheep's wool never stops growing.",
    world: "farm",
    quiz: "Which animal has wool that never stops growing?",
    count: 3, addCount: 3, schooling: false, ring: [2.5, 4], height: [0, 0], arScale: 0.25, voicePitch: 1.2,
    dims: [0.484, 0.95, 1.288], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/Model_Sheep.prefab", source: "pack" },
  },
  {
    id: "horse", name: "Horse", keywords: ["horse", "pony"],
    habitat: "land", emoji: "🐎", // web-only
    model: "/models/horse.glb",
    size: 2.34, // longest side in metres; AR size 0.37
    speed: 0.4, motion: "walk", move: "walk",
    color: "#734e3f",
    fact: "Horses can sleep standing up.",
    world: "farm",
    quiz: "Which animal can sleep standing up?",
    count: 1, addCount: 1, schooling: false, ring: [3.5, 5], height: [0, 0], arScale: 0.16, voicePitch: 0.8,
    dims: [0.649, 1.75, 2.342], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/Model_Horse.prefab", source: "pack" },
  },
  {
    id: "chicken", name: "Chicken", keywords: ["chicken", "hen"],
    habitat: "land", emoji: "🐔", // web-only
    model: "/models/chicken.glb",
    size: 0.66, // longest side in metres; AR size 0.33
    speed: 0.25, motion: "walk", move: "walk",
    color: "#f7f7f7",
    fact: "Birds, including chickens, are living relatives of the dinosaurs.",
    world: "farm",
    quiz: "Which farm bird is a living relative of the dinosaurs?",
    count: 3, addCount: 3, schooling: false, ring: [1.5, 2.8], height: [0, 0], arScale: 0.5, voicePitch: 2,
    dims: [0.354, 0.662, 0.572], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Chicken.prefab", source: "generated" },
  },
  {
    id: "pig", name: "Pig", keywords: ["pig", "piglet"],
    habitat: "land", emoji: "🐖", // web-only
    model: "/models/pig.glb",
    size: 1.6, // longest side in metres; AR size 0.48
    speed: 0.2, motion: "walk", move: "walk",
    color: "#d7a0a3",
    fact: "Pigs roll in mud to cool down, because they can hardly sweat.",
    world: "farm",
    quiz: "Which animal rolls in mud to cool down?",
    count: 1, addCount: 1, schooling: false, ring: [2, 3.5], height: [0, 0], arScale: 0.3, voicePitch: 1,
    dims: [0.542, 0.75, 1.602], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/Model_Pig.prefab", source: "pack" },
  },
  // ---- sky
  {
    id: "balloon", name: "Hot-Air Balloon", keywords: ["hot air balloon", "balloon"],
    habitat: "air", emoji: "🎈", // web-only
    model: "/models/balloon.glb",
    size: 3.35, // longest side in metres; AR size 0.4
    speed: 0.05, motion: "float", move: "float", // Unity does not move float creatures; speed is unused there
    color: "#fa8c5c",
    fact: "Hot air is lighter than cool air. That is what lifts a hot-air balloon.",
    world: "sky",
    quiz: "What rises because hot air is lighter than cool air?",
    count: 2, addCount: 2, schooling: false, ring: [4.6, 5.8], height: [1.5, 3], arScale: 0.12, voicePitch: 0.6,
    dims: [2.186, 3.35, 2.131], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_HotAirBalloon.prefab", source: "generated" },
  },
  {
    id: "bird", name: "Bird", keywords: ["bird"],
    habitat: "air", emoji: "🐦", // web-only
    model: "/models/bird.glb",
    size: 0.73, // longest side in metres; AR size 0.51
    speed: 1, motion: "fly", move: "fly",
    color: "#4d99f2",
    fact: "Many birds have hollow bones, which helps them fly.",
    world: "sky",
    quiz: "Which animals have hollow bones that help them fly?",
    count: 6, addCount: 5, schooling: true, ring: [2, 4.5], height: [1.8, 3.2], arScale: 0.7, voicePitch: 2.3,
    dims: [0.728, 0.243, 0.509], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Bird.prefab", source: "generated" },
  },
  {
    id: "kite", name: "Kite", keywords: ["kite"],
    habitat: "air", emoji: "🪁", // web-only
    model: "/models/kite.glb",
    size: 1.9, // longest side in metres; AR size 0.57
    speed: 0.05, motion: "float", move: "float", // Unity does not move float creatures; speed is unused there
    color: "#fa9e6b",
    fact: "Kites were invented in China more than two thousand years ago.",
    world: "sky",
    quiz: "What flying toy was invented in China over two thousand years ago?",
    count: 1, addCount: 1, schooling: false, ring: [3, 4.5], height: [2.6, 3.4], arScale: 0.3, voicePitch: 1.7,
    dims: [0.99, 1.895, 0.032], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Kite.prefab", source: "generated" },
  },
  {
    id: "plane", name: "Plane", keywords: ["plane", "airplane", "aeroplane"],
    habitat: "air", emoji: "✈️", // web-only
    model: "/models/plane.glb",
    size: 2.6, // longest side in metres; AR size 0.31
    speed: 1.4, motion: "fly", move: "fly",
    color: "#f7f7f7",
    fact: "A plane's wings are shaped so that the air rushing past pushes them up.",
    world: "sky",
    quiz: "What has wings shaped so that rushing air pushes them up?",
    count: 1, addCount: 1, schooling: false, ring: [5, 5.9], height: [2.8, 3.8], arScale: 0.12, voicePitch: 0.45,
    dims: [2.6, 0.7, 2.534], unity: { prefab: "Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Plane.prefab", source: "generated" },
  },
];

// Worlds (source: the Worlds array in Builder.Worlds.cs, saved to Assets/WishWorld/Definitions/Worlds/<id>.asset).
// - sky.texture is the equirectangular panorama the Unity exporter writes to /textures/ (source path in the comment).
//   top / horizon / bottom are the colours of Unity's painted sky for the same world, for use as a gradient
//   when the texture is missing. "aquarium" and "blank" have no photo in Unity: their real sky is the painted one.
// - fog is linear from fogNear to fogFar metres; fog: null means no fog.
// - ground is the colour Unity tints its plain ground with. Every world except "blank" hides that ground and
//   shows its own surroundings instead (scenery).
// - light.toSun is the unit vector toward the sun in three.js / glTF axes as the Unity exporter writes them
//   (/models/layouts.json: Unity x is negated). light.toSunUnity is the same vector in Unity axes (x right, y up,
//   z forward, left-handed). intensity multiplies the colour.
// - scenery / sceneryLite are the surroundings files the Unity exporter writes (full, and cut to about 40,000
//   triangles for the headset). /models/manifest.json is the authority if a name changes.
// - description is the line Unity's guide says on arrival (guideIntro).
export const WORLDS = [
  {
    id: "aquarium", name: "Aquarium", keywords: ["aquarium", "ocean", "under the sea", "reef"], showInMenu: true,
    sky: { texture: "/textures/sky_aquarium.jpg", top: "#1a75b8", horizon: "#1f8fbd", bottom: "#082e5c" }, // Unity's painted sky (no photo): Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Aquarium.png
    fog: "#1a78ad", fogNear: 4.96, fogFar: 62,
    ground: "#dbc794", groundMode: "full",
    light: { color: "#bfebff", intensity: 0.95, toSun: [-0.321, 0.766, -0.557], toSunUnity: [0.321, 0.766, -0.557] }, ambient: "#75a3c7",
    ambientSound: "amb_water", // a loop Unity synthesises (Sfx.Ambient); exported as /audio/sfx/amb_water.wav
    description: "Welcome to the aquarium! Touch a creature to learn about it.",
    prompt: "underwater coral reef, sun rays through blue water, friendly, stylized",
    scenery: "/models/world_aquarium.glb", sceneryLite: "/models/world_aquarium_lite.glb",
    creatures: [["clownfish", 8], ["turtle", 1], ["shark", 1], ["jellyfish", 4], ["ray", 1]],
  },
  {
    id: "zoo", name: "Zoo", keywords: ["zoo", "savanna", "safari"], showInMenu: true,
    sky: { texture: "/textures/sky_zoo.jpg", top: "#8099db", horizon: "#ffcc85", bottom: "#bd9e5c" }, // photo: Assets/ThirdParty/Skies/Sky_Zoo.jpg
    fog: "#c8c4b9", fogNear: 79.2, fogFar: 660,
    ground: "#ccad61", groundMode: "full",
    light: { color: "#ffe5b8", intensity: 1.1, toSun: [-0.676, 0.5, -0.541], toSunUnity: [0.676, 0.5, -0.541] }, ambient: "#bdad94",
    ambientSound: "amb_outdoor", // a loop Unity synthesises (Sfx.Ambient); exported as /audio/sfx/amb_outdoor.wav
    description: "Welcome to the savanna. Look how tall the giraffe is!",
    prompt: "african savanna grassland at golden hour, acacia trees, stylized",
    scenery: "/models/world_zoo.glb", sceneryLite: "/models/world_zoo_lite.glb",
    creatures: [["elephant", 1], ["giraffe", 1], ["zebra", 2], ["lion", 1], ["flamingo", 3]],
  },
  {
    id: "space", name: "Space", keywords: ["space", "outer space", "solar system", "stars"], showInMenu: true,
    sky: { texture: "/textures/sky_space.jpg", top: "#03030d", horizon: "#0f0a24", bottom: "#03030a" }, // photo: Assets/ThirdParty/Skies/Sky_Space.jpg
    fog: null, fogNear: 0, fogFar: 0,
    ground: "#4d5473", groundMode: "platform",
    light: { color: "#fffaf2", intensity: 1.1, toSun: [-0.379, 0.504, -0.776], toSunUnity: [0.379, 0.504, -0.776] }, ambient: "#5c5e7a",
    ambientSound: "amb_hum", // a loop Unity synthesises (Sfx.Ambient); exported as /audio/sfx/amb_hum.wav
    description: "Welcome to space. Everything here is floating!",
    prompt: "deep space star field with a distant nebula, stylized",
    scenery: "/models/world_space.glb", sceneryLite: "/models/world_space_lite.glb",
    creatures: [["saturn", 1], ["earth", 1], ["venus", 1], ["astronaut", 1], ["rocket", 1], ["satellite", 1], ["comet", 1]],
  },
  {
    id: "dinosaurs", name: "Dinosaurs", keywords: ["dinosaurs", "dinosaur", "dino", "dinosaur valley"], showInMenu: true,
    sky: { texture: "/textures/sky_dinosaurs.jpg", top: "#73b2d1", horizon: "#cce5c2", bottom: "#336633" }, // photo: Assets/ThirdParty/Skies/Sky_Dinosaurs.jpg
    fog: "#b8bbaf", fogNear: 81.6, fogFar: 680,
    ground: "#5c8f47", groundMode: "full",
    light: { color: "#fff7e0", intensity: 1.05, toSun: [-0.702, 0.5, -0.507], toSunUnity: [0.702, 0.5, -0.507] }, ambient: "#9eb89e",
    ambientSound: "amb_outdoor", // a loop Unity synthesises (Sfx.Ambient); exported as /audio/sfx/amb_outdoor.wav
    description: "Shh. The dinosaurs are walking by.",
    prompt: "prehistoric jungle valley with ferns and a volcano far away, stylized",
    scenery: "/models/world_dinosaurs.glb", sceneryLite: "/models/world_dinosaurs_lite.glb",
    creatures: [["trex", 1], ["triceratops", 1], ["stegosaurus", 1], ["pterosaur", 2]],
  },
  {
    id: "arctic", name: "Arctic", keywords: ["arctic", "north pole", "ice"], showInMenu: true,
    sky: { texture: "/textures/sky_arctic.jpg", top: "#080f33", horizon: "#3d6699", bottom: "#cce0f2" }, // photo: Assets/ThirdParty/Skies/Sky_Arctic.jpg
    fog: "#385ca9", fogNear: 84, fogFar: 700,
    ground: "#ebf5ff", groundMode: "full",
    light: { color: "#cce5ff", intensity: 0.85, toSun: [-0.649, 0.5, -0.574], toSunUnity: [0.649, 0.5, -0.574] }, ambient: "#708abd",
    ambientSound: "amb_wind", // a loop Unity synthesises (Sfx.Ambient); exported as /audio/sfx/amb_wind.wav
    description: "Brr! Welcome to the ice, under the northern lights.",
    prompt: "arctic ice field at night under green aurora, stylized",
    scenery: "/models/world_arctic.glb", sceneryLite: "/models/world_arctic_lite.glb",
    creatures: [["penguin", 4], ["polarbear", 1], ["seal", 1], ["whale", 1], ["snowyowl", 1]],
  },
  {
    id: "rainforest", name: "Rainforest", keywords: ["rainforest", "jungle", "forest"], showInMenu: true,
    sky: { texture: "/textures/sky_rainforest.jpg", top: "#529461", horizon: "#8cc780", bottom: "#1a401f" }, // photo: Assets/ThirdParty/Skies/Sky_Rainforest.jpg
    fog: "#afc3b2", fogNear: 9, fogFar: 150,
    ground: "#427038", groundMode: "full",
    light: { color: "#f2ffdb", intensity: 0.95, toSun: [-0.548, 0.698, -0.461], toSunUnity: [0.548, 0.698, -0.461] }, ambient: "#85a885",
    ambientSound: "amb_outdoor", // a loop Unity synthesises (Sfx.Ambient); exported as /audio/sfx/amb_outdoor.wav
    description: "Listen. The rainforest is full of life.",
    prompt: "dense rainforest canopy, shafts of light, lush green, stylized",
    scenery: "/models/world_rainforest.glb", sceneryLite: "/models/world_rainforest_lite.glb",
    creatures: [["parrot", 2], ["monkey", 1], ["frog", 2], ["butterfly", 6], ["sloth", 1]],
  },
  {
    id: "farm", name: "Farm", keywords: ["farm", "barn"], showInMenu: true,
    sky: { texture: "/textures/sky_farm.jpg", top: "#66a6f2", horizon: "#cce5fa", bottom: "#66a64d" }, // photo: Assets/ThirdParty/Skies/Sky_Farm.jpg
    fog: "#aab0ab", fogNear: 81.6, fogFar: 680,
    ground: "#75b252", groundMode: "full",
    light: { color: "#fffae5", intensity: 1.1, toSun: [-0.57, 0.698, -0.433], toSunUnity: [0.57, 0.698, -0.433] }, ambient: "#b2bfb2",
    ambientSound: "amb_outdoor", // a loop Unity synthesises (Sfx.Ambient); exported as /audio/sfx/amb_outdoor.wav
    description: "Welcome to the farm. Say hello to the animals!",
    prompt: "rolling green farm fields with a red barn, blue sky, stylized",
    scenery: "/models/world_farm.glb", sceneryLite: "/models/world_farm_lite.glb",
    creatures: [["cow", 1], ["sheep", 3], ["horse", 1], ["chicken", 3], ["pig", 1]],
  },
  {
    id: "sky", name: "Sky", keywords: ["sky", "clouds", "above the clouds"], showInMenu: true,
    sky: { texture: "/textures/sky_sky.jpg", top: "#4080f2", horizon: "#bfe0ff", bottom: "#f2f7ff" }, // photo: Assets/ThirdParty/Skies/Sky_Sky.jpg
    fog: "#b3b2b3", fogNear: 237, fogFar: 790,
    ground: "#f7faff", groundMode: "platform",
    light: { color: "#ffffff", intensity: 1.1, toSun: [-0.558, 0.5, -0.663], toSunUnity: [0.558, 0.5, -0.663] }, ambient: "#bfcce5",
    ambientSound: "amb_wind", // a loop Unity synthesises (Sfx.Ambient); exported as /audio/sfx/amb_wind.wav
    description: "We are above the clouds. Look who is flying by!",
    prompt: "above a sea of white clouds, bright blue sky, stylized",
    scenery: "/models/world_sky.glb", sceneryLite: "/models/world_sky_lite.glb",
    creatures: [["balloon", 2], ["bird", 6], ["kite", 1], ["plane", 1]],
  },
  {
    id: "blank", name: "Wish World", keywords: [], showInMenu: false,
    sky: { texture: "/textures/sky_blank.jpg", top: "#b2bdf0", horizon: "#fce0db", bottom: "#f2edf7" }, // Unity's painted sky (no photo): Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_WishWorld.png
    fog: null, fogNear: 0, fogFar: 0,
    ground: "#f5edfa", groundMode: "platform",
    light: { color: "#fffaf5", intensity: 1.05, toSun: [-0.321, 0.766, -0.557], toSunUnity: [0.321, 0.766, -0.557] }, ambient: "#b8b8cc",
    ambientSound: "amb_wind", // a loop Unity synthesises (Sfx.Ambient); exported as /audio/sfx/amb_wind.wav
    description: "What do you wish for? Say it, or pick from the menu.", // Unity has no intro for this world; this is the guide's wish-mode greeting
    prompt: "soft pastel dream sky",
    scenery: null, sceneryLite: null, // no surroundings: a floating platform (/models/world_platform.glb)
    creatures: [],
  },
];

// Theme (source: Assets/WishWorld/Resources/WWTheme.asset, class Scripts/Core/WWTheme.cs).
export const THEME = {
  colors: {
    sky: "#b8cce0", // palette blue-grey
    snow: "#f2f7fc", // ribbon text, snow
    slate: "#334052", // text and outlines
    peach: "#ffb88c", // accent buttons, pointer rays
    panel: "#edf2f7", // panel fill
    button: "#d1e0f0", // button and card fill
    ice: "#8fb0d4", // inner frame line, snowflakes, icicle tips
    ribbon: "#45618c", // title ribbons
    shade: "#788ca8", // drop shadows under panels
  },
  // Other fixed UI colours in the Unity code (WWUI.cs, WWUI.Styles.cs, Builder.Core.cs).
  extra: {
    snowWhite: "#fbfcff", // white band on frames, snow caps
    snowUnder: "#c2d6ed", // underside of snow caps
    frostBlue: "#ccdef2", // bottom of panel gradients
    hoverGlow: "#ffedb2", // halo behind a hovered button
    white: "#fafafa", // builder white
    black: "#14141a", // builder black (eyes)
    snowShade: "#d6e3f2", // shaded snow
    glow: "#ffd999", // creature highlight (_GlowColor)
    blobShadow: "#0a0f1f", // blob shadow, at 46% alpha
  },
  font: "Almendra", // body text
  fonts: {
    // file = where the web pages load it from; source = the file in the Unity project to copy there.
    title: { family: "Mountains of Christmas", weight: 700, file: "/fonts/MountainsofChristmas-Bold.ttf", source: "Assets/ThirdParty/Fonts/MountainsofChristmas-Bold.ttf" }, // ribbons, menu titles
    heading: { family: "Berkshire Swash", weight: 400, file: "/fonts/BerkshireSwash-Regular.ttf", source: "Assets/ThirdParty/Fonts/BerkshireSwash-Regular.ttf" }, // card titles, buttons
    body: { family: "Almendra", weight: 400, file: "/fonts/Almendra-Regular.ttf", source: "Assets/ThirdParty/Fonts/Almendra-Regular.ttf" }, // captions, facts
    plain: { family: "Liberation Sans", weight: 400, file: null, source: null }, // numbers on score and dashboard panels (any sans-serif)
  },
};

// Colours a wish can give a creature (source: CommandParser.ColorValues). "rainbow" gives each one its own hue.
export const TINTS = {
  red: "#eb3833",
  blue: "#3873f2",
  purple: "#9e4de0",
  gold: "#ffc72e",
  rainbow: null,
};

export function creatureById(id) { return CREATURES.find(c => c.id === id) || null; }
export function worldById(id) { return WORLDS.find(w => w.id === id) || null; }
export function creaturesInWorld(worldId) { return CREATURES.filter(c => c.world === worldId); }
