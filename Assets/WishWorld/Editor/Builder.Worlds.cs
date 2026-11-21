using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace WishWorld.EditorTools
{
    public static partial class WishWorldBuilder
    {
        class CreatureSpec
        {
            public string id, name, fact, quiz, pack; public string[] keys; public Func<MeshBuilder> mesh;
            public MoveType move; public float speed, minD, maxD, minH, maxH, ar; public int add = 1; public bool school; public float pitch = 1f;
        }

        static CreatureSpec Cr(string id, string name, string keys, Func<MeshBuilder> mesh, MoveType move, float speed, float minD, float maxD,
            float minH, float maxH, float ar, string fact, string quiz, int add = 1, bool school = false, float pitch = 1f, string pack = null)
            => new CreatureSpec { pack = pack, id = id, name = name, keys = keys.Split(','), mesh = mesh, move = move, speed = speed, minD = minD, maxD = maxD,
                                  minH = minH, maxH = maxH, ar = ar, fact = fact, quiz = quiz, add = add, school = school, pitch = pitch };

        // Facts are written from general knowledge and have NOT been checked against a source.
        // Every definition is saved with factChecked = false; check each one before showing it to children.
        static readonly CreatureSpec[] Creatures =
        {
            // aquarium
            Cr("clownfish", "Clownfish", "clownfish,flying fish,fish", CreatureMeshes.Clownfish, MoveType.Swim, 0.35f, 1.3f, 2.4f, 1.0f, 1.7f, 1f,
                "Clownfish live among the stinging arms of sea anemones, which do not hurt them.", "Which fish makes its home in a sea anemone?", 8, true, 1.8f),
            Cr("turtle", "Sea Turtle", "turtle,sea turtle", CreatureMeshes.Turtle, MoveType.Swim, 0.25f, 2.0f, 3.4f, 0.9f, 1.8f, 0.5f,
                "Sea turtles swim back to the beach where they hatched to lay their own eggs.", "Which animal returns to the beach where it hatched to lay its eggs?", 1, false, 0.8f),
            Cr("shark", "Shark", "shark", CreatureMeshes.Shark, MoveType.Swim, 0.5f, 3.6f, 5.4f, 1.2f, 2.4f, 0.35f,
                "A shark has no bones. Its skeleton is made of cartilage, the bendy stuff in your ears.", "Which animal has a skeleton of cartilage and no bones?", 1, false, 0.5f),
            Cr("jellyfish", "Jellyfish", "jellyfish,jelly", CreatureMeshes.Jellyfish, MoveType.Float, 0.1f, 1.4f, 3.0f, 1.0f, 2.2f, 0.8f,
                "Jellyfish have no brain, no heart and no bones.", "Which sea animal has no brain and no heart?", 3, false, 1.5f),
            Cr("ray", "Ray", "ray,stingray,manta ray,manta", CreatureMeshes.Ray, MoveType.Swim, 0.35f, 2.6f, 4.4f, 0.6f, 1.2f, 0.45f,
                "Rays swim by flapping their wide fins like wings.", "Which sea animal swims by flapping its fins like wings?", 1, false, 0.7f),
            // zoo
            Cr("elephant", "Elephant", "elephant", CreatureMeshes.Elephant, MoveType.Walk, 0.3f, 4.8f, 5.8f, 0, 0, 0.12f,
                "An elephant's trunk has no bones in it. It is all muscle.", "Which animal has a long nose with no bones in it?", 1, false, 0.45f),
            Cr("giraffe", "Giraffe", "giraffe", CreatureMeshes.Giraffe, MoveType.Walk, 0.3f, 4.8f, 5.9f, 0, 0, 0.1f,
                "A giraffe's long neck has seven bones, the same number as your neck.", "Which animal's long neck has seven bones, just like yours?", 1, false, 0.9f),
            Cr("zebra", "Zebra", "zebra", CreatureMeshes.Zebra, MoveType.Walk, 0.4f, 3.0f, 4.5f, 0, 0, 0.2f,
                "Every zebra has its own stripe pattern. No two are the same.", "Which animal has stripes that are different on every one?", 1, false, 1.1f, pack: "Zebra"),
            Cr("lion", "Lion", "lion", CreatureMeshes.Lion, MoveType.Walk, 0.35f, 3.0f, 4.5f, 0, 0, 0.22f,
                "A lion's roar can be heard from several kilometres away.", "Whose roar can be heard from kilometres away?", 1, false, 0.55f),
            Cr("flamingo", "Flamingo", "flamingo", CreatureMeshes.Flamingo, MoveType.Walk, 0.2f, 2.0f, 3.4f, 0, 0, 0.3f,
                "Flamingos are pink because of the food they eat.", "Which bird turns pink because of its food?", 3, false, 1.4f),
            // space
            Cr("saturn", "Saturn", "saturn,planet", CreatureMeshes.Saturn, MoveType.Orbit, 0.22f, 1.7f, 1.7f, 0, 0, 0.3f,
                "Saturn's rings are made mostly of pieces of ice.", "Which planet has rings made mostly of ice?", 1, false, 0.6f, pack: "Saturn"),
            Cr("earth", "Earth", "earth,planet", CreatureMeshes.Earth, MoveType.Orbit, 0.3f, 1.2f, 1.2f, 0, 0, 0.3f,
                "More than two thirds of the Earth is covered by ocean.", "Which planet is mostly covered by ocean?", 1, false, 0.8f),
            Cr("venus", "Venus", "venus,planet", CreatureMeshes.Venus, MoveType.Orbit, 0.35f, 0.75f, 0.75f, 0, 0, 0.3f,
                "A day on Venus is longer than its year.", "On which planet is a day longer than a year?", 1, false, 1.0f),
            Cr("astronaut", "Astronaut", "astronaut", CreatureMeshes.Astronaut, MoveType.Float, 0.1f, 2.0f, 3.4f, 1.0f, 2.0f, 0.25f,
                "Astronauts in orbit float because they are falling around the Earth all the time.", "Who floats while circling the Earth?", 1, false, 1.2f),
            Cr("rocket", "Rocket", "rocket,rocket ship", CreatureMeshes.Rocket, MoveType.Fly, 0.7f, 3.6f, 5.0f, 1.6f, 3.0f, 0.2f,
                "To stay in orbit, a rocket has to reach about 28,000 kilometres an hour.", "What must reach about 28,000 kilometres an hour to stay in orbit?", 1, false, 0.4f),
            Cr("satellite", "Satellite", "satellite", CreatureMeshes.Satellite, MoveType.Float, 0.1f, 2.6f, 4.0f, 1.8f, 2.8f, 0.25f,
                "Satellites circle the Earth. Some help phones and maps know where you are.", "What circles the Earth and helps maps know where you are?", 1, false, 2.0f),
            Cr("comet", "Comet", "comet", CreatureMeshes.Comet, MoveType.Fly, 0.9f, 4.0f, 5.5f, 2.0f, 3.2f, 0.4f,
                "A comet is a ball of ice and dust. Its tail always points away from the Sun.", "What is a ball of ice and dust with a long tail?", 1, false, 2.4f),
            // dinosaurs
            Cr("trex", "T. rex", "t rex,trex,tyrannosaurus,rex", CreatureMeshes.TRex, MoveType.Walk, 0.35f, 5.2f, 5.9f, 0, 0, 0.1f,
                "T. rex lived closer in time to you than to Stegosaurus.", "Which dinosaur lived closer in time to you than to Stegosaurus?", 1, false, 0.35f),
            Cr("triceratops", "Triceratops", "triceratops", CreatureMeshes.Triceratops, MoveType.Walk, 0.25f, 4.6f, 5.6f, 0, 0, 0.12f,
                "The name Triceratops means three-horned face.", "Which dinosaur's name means three-horned face?", 1, false, 0.5f),
            Cr("stegosaurus", "Stegosaurus", "stegosaurus", CreatureMeshes.Stegosaurus, MoveType.Walk, 0.25f, 4.6f, 5.8f, 0, 0, 0.12f,
                "Stegosaurus had two rows of bony plates along its back.", "Which dinosaur had bony plates along its back?", 1, false, 0.6f),
            Cr("pterosaur", "Pterosaur", "pterosaur,pterodactyl", CreatureMeshes.Pterosaur, MoveType.Fly, 0.9f, 4.0f, 5.5f, 2.6f, 3.6f, 0.2f,
                "Pterosaurs were flying reptiles. They were not dinosaurs.", "Which flying reptile was not really a dinosaur?", 2, false, 1.6f),
            // arctic
            Cr("penguin", "Penguin", "penguin", CreatureMeshes.Penguin, MoveType.Walk, 0.2f, 1.8f, 3.0f, 0, 0, 0.4f,
                "Penguins live in the south and polar bears in the north, so they never meet in the wild.", "Which bird lives in the south and never meets a polar bear?", 3, false, 1.5f),
            Cr("polarbear", "Polar Bear", "polar bear,bear", CreatureMeshes.PolarBear, MoveType.Walk, 0.3f, 3.6f, 5.0f, 0, 0, 0.18f,
                "Under its white fur, a polar bear's skin is black.", "Which animal has black skin under white fur?", 1, false, 0.5f),
            Cr("seal", "Seal", "seal", CreatureMeshes.Seal, MoveType.Walk, 0.12f, 2.6f, 4.0f, 0, 0, 0.25f,
                "Seals have a thick layer of fat called blubber that keeps them warm.", "Which animal keeps warm with a layer of blubber?", 1, false, 0.9f),
            Cr("whale", "Blue Whale", "whale,blue whale", CreatureMeshes.Whale, MoveType.Swim, 0.4f, 5.6f, 6.0f, 2.6f, 3.4f, 0.12f,
                "The blue whale is the largest animal that has ever lived.", "Which is the largest animal that has ever lived?", 1, false, 0.3f),
            Cr("snowyowl", "Snowy Owl", "snowy owl,owl", CreatureMeshes.SnowyOwl, MoveType.Fly, 0.8f, 2.6f, 4.4f, 1.8f, 3.0f, 0.5f,
                "Unlike most owls, snowy owls often hunt in the daytime.", "Which owl often hunts in the daytime?", 1, false, 1.3f),
            // rainforest
            Cr("parrot", "Parrot", "parrot", CreatureMeshes.Parrot, MoveType.Fly, 0.8f, 2.0f, 4.0f, 1.6f, 2.8f, 0.6f,
                "Parrots can copy sounds, even human words.", "Which bird can copy human words?", 2, false, 1.9f),
            Cr("monkey", "Monkey", "monkey", CreatureMeshes.Monkey, MoveType.Walk, 0.35f, 2.5f, 4.0f, 0, 0, 0.3f,
                "Some monkeys, like spider monkeys, can hang from a branch by their tails.", "Which animal can hang from a branch by its tail?", 1, false, 1.6f),
            Cr("frog", "Tree Frog", "frog,tree frog", CreatureMeshes.Frog, MoveType.Walk, 0.1f, 1.3f, 2.2f, 0, 0, 0.8f,
                "Poison dart frogs wear bright colours to warn that they are poisonous.", "Which animal uses bright colours as a warning?", 2, false, 2.2f),
            Cr("butterfly", "Butterfly", "butterfly", CreatureMeshes.Butterfly, MoveType.Fly, 0.3f, 1.2f, 2.5f, 1.0f, 1.9f, 1f,
                "Butterflies taste with their feet.", "Which insect tastes with its feet?", 8, false, 2.6f),
            Cr("sloth", "Sloth", "sloth", CreatureMeshes.Sloth, MoveType.Float, 0.05f, 2.5f, 3.5f, 2.0f, 2.6f, 0.4f,
                "Sloths move so slowly that green algae grows in their fur.", "Which animal moves so slowly that algae grows in its fur?", 1, false, 0.7f),
            // farm
            Cr("cow", "Cow", "cow", CreatureMeshes.Cow, MoveType.Walk, 0.2f, 3.0f, 4.5f, 0, 0, 0.18f,
                "A cow's stomach has four parts.", "Which farm animal has a stomach with four parts?", 1, false, 0.5f, pack: "Cow"),
            Cr("sheep", "Sheep", "sheep,lamb", CreatureMeshes.Sheep, MoveType.Walk, 0.2f, 2.5f, 4.0f, 0, 0, 0.25f,
                "A sheep's wool never stops growing.", "Which animal has wool that never stops growing?", 3, false, 1.2f, pack: "Sheep"),
            Cr("horse", "Horse", "horse,pony", CreatureMeshes.Horse, MoveType.Walk, 0.4f, 3.5f, 5.0f, 0, 0, 0.16f,
                "Horses can sleep standing up.", "Which animal can sleep standing up?", 1, false, 0.8f, pack: "Horse"),
            Cr("chicken", "Chicken", "chicken,hen", CreatureMeshes.Chicken, MoveType.Walk, 0.25f, 1.5f, 2.8f, 0, 0, 0.5f,
                "Birds, including chickens, are living relatives of the dinosaurs.", "Which farm bird is a living relative of the dinosaurs?", 3, false, 2.0f),
            Cr("pig", "Pig", "pig,piglet", CreatureMeshes.Pig, MoveType.Walk, 0.2f, 2.0f, 3.5f, 0, 0, 0.3f,
                "Pigs roll in mud to cool down, because they can hardly sweat.", "Which animal rolls in mud to cool down?", 1, false, 1.0f, pack: "Pig"),
            // sky
            Cr("balloon", "Hot-Air Balloon", "hot air balloon,balloon", CreatureMeshes.Balloon, MoveType.Float, 0.05f, 4.6f, 5.8f, 1.5f, 3.0f, 0.12f,
                "Hot air is lighter than cool air. That is what lifts a hot-air balloon.", "What rises because hot air is lighter than cool air?", 2, false, 0.6f),
            Cr("bird", "Bird", "bird", CreatureMeshes.SkyBird, MoveType.Fly, 1.0f, 2.0f, 4.5f, 1.8f, 3.2f, 0.7f,
                "Many birds have hollow bones, which helps them fly.", "Which animals have hollow bones that help them fly?", 5, true, 2.3f),
            Cr("kite", "Kite", "kite", CreatureMeshes.Kite, MoveType.Float, 0.05f, 3.0f, 4.5f, 2.6f, 3.4f, 0.3f,
                "Kites were invented in China more than two thousand years ago.", "What flying toy was invented in China over two thousand years ago?", 1, false, 1.7f),
            Cr("plane", "Plane", "plane,airplane,aeroplane", CreatureMeshes.Plane, MoveType.Fly, 1.4f, 5.0f, 5.9f, 2.8f, 3.8f, 0.12f,
                "A plane's wings are shaped so that the air rushing past pushes them up.", "What has wings shaped so that rushing air pushes them up?", 1, false, 0.45f),
        };

        class WorldSpec
        {
            public string id, name, keys, intro, prompt; public SkySpec sky; public GroundMode ground; public Color groundColor, fogColor, lightColor, ambient;
            public float fogEnd, light = 1f; public int ambientKind; public bool menu = true; public (string id, int count)[] creatures;
            /// <summary>Real sky photograph (Assets/ThirdParty/Skies/Sky_&lt;photo&gt;.jpg); the painted sky is the fallback.</summary>
            public string photo;
            /// <summary>Fog distance once the world has surroundings to the horizon, and where it starts as a fraction of that.</summary>
            public float farFog, fogStart = 0.12f;
        }
        static Color Col(float r, float g, float b) => new Color(r, g, b);

        static readonly WorldSpec[] Worlds =
        {
            new WorldSpec { id = "aquarium", farFog = 62f, fogStart = 0.08f, name = "Aquarium", keys = "aquarium,ocean,under the sea,reef", intro = "Welcome to the aquarium! Touch a creature to learn about it.",
                prompt = "underwater coral reef, sun rays through blue water, friendly, stylized",
                sky = new SkySpec { top = Col(0.10f, 0.46f, 0.72f), horizon = Col(0.12f, 0.56f, 0.74f), bottom = Col(0.03f, 0.18f, 0.36f), rays = true },
                ground = GroundMode.Full, groundColor = Col(0.86f, 0.78f, 0.58f), fogColor = Col(0.10f, 0.47f, 0.68f), fogEnd = 24f,
                lightColor = Col(0.75f, 0.92f, 1f), light = 0.95f, ambient = Col(0.46f, 0.64f, 0.78f), ambientKind = 0,
                creatures = new[] { ("clownfish", 8), ("turtle", 1), ("shark", 1), ("jellyfish", 4), ("ray", 1) } },
            new WorldSpec { id = "zoo", photo = "Zoo", farFog = 660f, name = "Zoo", keys = "zoo,savanna,safari", intro = "Welcome to the savanna. Look how tall the giraffe is!",
                prompt = "african savanna grassland at golden hour, acacia trees, stylized",
                sky = new SkySpec { top = Col(0.50f, 0.60f, 0.86f), horizon = Col(1f, 0.80f, 0.52f), bottom = Col(0.74f, 0.62f, 0.36f), clouds = 0.3f, cloudColor = Col(1f, 0.90f, 0.80f), glow = Col(1f, 0.6f, 0.25f) * 0.7f, glowElevation = 0.14f },
                ground = GroundMode.Full, groundColor = Col(0.80f, 0.68f, 0.38f), fogColor = Col(1f, 0.85f, 0.60f), fogEnd = 60f,
                lightColor = Col(1f, 0.90f, 0.72f), light = 1.1f, ambient = Col(0.74f, 0.68f, 0.58f), ambientKind = 3,
                creatures = new[] { ("elephant", 1), ("giraffe", 1), ("zebra", 2), ("lion", 1), ("flamingo", 3) } },
            new WorldSpec { id = "space", photo = "Space", name = "Space", keys = "space,outer space,solar system,stars", intro = "Welcome to space. Everything here is floating!",
                prompt = "deep space star field with a distant nebula, stylized",
                sky = new SkySpec { top = Col(0.01f, 0.01f, 0.05f), horizon = Col(0.06f, 0.04f, 0.14f), bottom = Col(0.01f, 0.01f, 0.04f), stars = 1f, glow = Col(0.5f, 0.35f, 0.9f) * 0.45f, glowElevation = 0.35f },
                ground = GroundMode.Platform, groundColor = Col(0.30f, 0.33f, 0.45f), fogEnd = 0f,
                lightColor = Col(1f, 0.98f, 0.95f), light = 1.1f, ambient = Col(0.36f, 0.37f, 0.48f), ambientKind = 2,
                creatures = new[] { ("saturn", 1), ("earth", 1), ("venus", 1), ("astronaut", 1), ("rocket", 1), ("satellite", 1), ("comet", 1) } },
            new WorldSpec { id = "dinosaurs", photo = "Dinosaurs", farFog = 680f, name = "Dinosaurs", keys = "dinosaurs,dinosaur,dino,dinosaur valley", intro = "Shh. The dinosaurs are walking by.",
                prompt = "prehistoric jungle valley with ferns and a volcano far away, stylized",
                sky = new SkySpec { top = Col(0.45f, 0.70f, 0.82f), horizon = Col(0.80f, 0.90f, 0.76f), bottom = Col(0.2f, 0.4f, 0.2f), clouds = 0.4f, cloudColor = Col(0.98f, 0.97f, 0.92f), glow = Col(1f, 0.9f, 0.6f) * 0.4f, glowElevation = 0.5f },
                ground = GroundMode.Full, groundColor = Col(0.36f, 0.56f, 0.28f), fogColor = Col(0.76f, 0.88f, 0.76f), fogEnd = 55f,
                lightColor = Col(1f, 0.97f, 0.88f), light = 1.05f, ambient = Col(0.62f, 0.72f, 0.62f), ambientKind = 3,
                creatures = new[] { ("trex", 1), ("triceratops", 1), ("stegosaurus", 1), ("pterosaur", 2) } },
            new WorldSpec { id = "arctic", photo = "Arctic", farFog = 700f, name = "Arctic", keys = "arctic,north pole,ice", intro = "Brr! Welcome to the ice, under the northern lights.",
                prompt = "arctic ice field at night under green aurora, stylized",
                sky = new SkySpec { top = Col(0.03f, 0.06f, 0.20f), horizon = Col(0.24f, 0.40f, 0.60f), bottom = Col(0.80f, 0.88f, 0.95f), stars = 0.5f, aurora = true },
                ground = GroundMode.Full, groundColor = Col(0.92f, 0.96f, 1f), fogColor = Col(0.50f, 0.64f, 0.80f), fogEnd = 60f,
                lightColor = Col(0.80f, 0.90f, 1f), light = 0.85f, ambient = Col(0.44f, 0.54f, 0.74f), ambientKind = 1,
                creatures = new[] { ("penguin", 4), ("polarbear", 1), ("seal", 1), ("whale", 1), ("snowyowl", 1) } },
            new WorldSpec { id = "rainforest", photo = "Rainforest", farFog = 150f, fogStart = 0.06f, name = "Rainforest", keys = "rainforest,jungle,forest", intro = "Listen. The rainforest is full of life.",
                prompt = "dense rainforest canopy, shafts of light, lush green, stylized",
                sky = new SkySpec { top = Col(0.32f, 0.58f, 0.38f), horizon = Col(0.55f, 0.78f, 0.50f), bottom = Col(0.10f, 0.25f, 0.12f), clouds = 0.6f, cloudColor = Col(0.16f, 0.40f, 0.20f), rays = true },
                ground = GroundMode.Full, groundColor = Col(0.26f, 0.44f, 0.22f), fogColor = Col(0.45f, 0.68f, 0.45f), fogEnd = 30f,
                lightColor = Col(0.95f, 1f, 0.86f), light = 0.95f, ambient = Col(0.52f, 0.66f, 0.52f), ambientKind = 3,
                creatures = new[] { ("parrot", 2), ("monkey", 1), ("frog", 2), ("butterfly", 6), ("sloth", 1) } },
            new WorldSpec { id = "farm", photo = "Farm", farFog = 680f, name = "Farm", keys = "farm,barn", intro = "Welcome to the farm. Say hello to the animals!",
                prompt = "rolling green farm fields with a red barn, blue sky, stylized",
                sky = new SkySpec { top = Col(0.40f, 0.65f, 0.95f), horizon = Col(0.80f, 0.90f, 0.98f), bottom = Col(0.4f, 0.65f, 0.3f), clouds = 0.45f, cloudColor = Col(0.98f, 0.98f, 0.98f), glow = Col(1f, 0.95f, 0.8f) * 0.35f, glowElevation = 0.6f },
                ground = GroundMode.Full, groundColor = Col(0.46f, 0.70f, 0.32f), fogColor = Col(0.80f, 0.90f, 0.98f), fogEnd = 70f,
                lightColor = Col(1f, 0.98f, 0.90f), light = 1.1f, ambient = Col(0.70f, 0.75f, 0.70f), ambientKind = 3,
                creatures = new[] { ("cow", 1), ("sheep", 3), ("horse", 1), ("chicken", 3), ("pig", 1) } },
            new WorldSpec { id = "sky", photo = "Sky", farFog = 790f, fogStart = 0.3f, name = "Sky", keys = "sky,clouds,above the clouds", intro = "We are above the clouds. Look who is flying by!",
                prompt = "above a sea of white clouds, bright blue sky, stylized",
                sky = new SkySpec { top = Col(0.25f, 0.50f, 0.95f), horizon = Col(0.75f, 0.88f, 1f), bottom = Col(0.95f, 0.97f, 1f), clouds = 0.7f, cloudColor = Col(0.99f, 0.99f, 0.99f) },
                ground = GroundMode.Platform, groundColor = Col(0.97f, 0.98f, 1f), fogEnd = 0f,
                lightColor = Col(1f, 1f, 1f), light = 1.1f, ambient = Col(0.75f, 0.80f, 0.90f), ambientKind = 1,
                creatures = new[] { ("balloon", 2), ("bird", 6), ("kite", 1), ("plane", 1) } },
            new WorldSpec { id = "blank", name = "Wish World", keys = "", intro = "", prompt = "soft pastel dream sky", menu = false,
                sky = new SkySpec { top = Col(0.70f, 0.74f, 0.94f), horizon = Col(0.99f, 0.88f, 0.86f), bottom = Col(0.95f, 0.93f, 0.97f), clouds = 0.3f, cloudColor = Col(1f, 1f, 1f) },
                ground = GroundMode.Platform, groundColor = Col(0.96f, 0.93f, 0.98f), fogEnd = 0f,
                lightColor = Col(1f, 0.98f, 0.96f), light = 1.05f, ambient = Col(0.72f, 0.72f, 0.80f), ambientKind = 1,
                creatures = new (string, int)[0] },
        };

        static partial void BuildWorldContentImpl()
        {
            var byId = new Dictionary<string, CreatureDefinition>();
            var creatureList = new List<CreatureDefinition>();
            int tris = 0;
            foreach (var c in Creatures)
            {
                // Third-party pack model if there is one (and packs are enabled), else the project's own generated model.
                string bare = c.name.Replace(" ", "").Replace(".", "").Replace("-", "");
                var mb = PackMeshes.Load(c.pack);
                bool fromPack = mb != null;
                if (mb == null) mb = c.mesh();
                string pname = (fromPack ? "Model_" : "PLACEHOLDER_") + bare;
                string stale = Gen + "/Prefabs/" + (fromPack ? "PLACEHOLDER_" : "Model_") + bare + ".prefab";
                if (System.IO.File.Exists(stale)) AssetDatabase.DeleteAsset(stale);
                tris += mb.TriangleCount;
                var mesh = SaveMesh(mb, pname);
                var go = MeshObject(pname, mesh);
                var box = go.AddComponent<BoxCollider>();
                box.center = mesh.bounds.center;
                box.size = Vector3.Max(mesh.bounds.size, Vector3.one * 0.12f);   // tiny creatures still need something to touch
                box.isTrigger = true;
                var prefab = SavePrefab(go, pname);

                var d = ScriptableObject.CreateInstance<CreatureDefinition>();
                d.id = c.id; d.displayName = c.name; d.keywords = c.keys; d.prefab = prefab; d.moveType = c.move; d.speed = c.speed;
                d.minDistance = c.minD; d.maxDistance = c.maxD; d.minHeight = c.minH; d.maxHeight = c.maxH; d.arScale = c.ar;
                d.addCount = c.add; d.schooling = c.school; d.voicePitch = c.pitch; d.fact = c.fact; d.quizQuestion = c.quiz; d.factChecked = false;
                d = Save(d, Root + "/Definitions/Creatures/" + c.id + ".asset");
                byId[c.id] = d;
                creatureList.Add(d);
            }
            Debug.Log("[WishWorld] " + Creatures.Length + " placeholder creatures, " + tris + " triangles in total, average " + tris / Creatures.Length + ".");

            var worldList = new List<WorldDefinition>();
            foreach (var w in Worlds)
            {
                var d = ScriptableObject.CreateInstance<WorldDefinition>();
                d.id = w.id; d.displayName = w.name; d.keywords = string.IsNullOrEmpty(w.keys) ? new string[0] : w.keys.Split(',');
                var painted = BuildSky(w.name.Replace(" ", ""), w.sky);
                var photo = SkyPhoto(w.photo);
                d.skyTexture = photo != null ? photo : painted;
                d.sunDirection = photo != null ? SunDirection(w.photo) : Vector3.zero;
                d.scenery = BuildScenery(w.id);
                d.skyPrompt = w.prompt; d.ground = w.ground; d.groundColor = w.groundColor;
                d.fogColor = photo != null ? SkyHorizon(w.photo, w.fogColor) : w.fogColor;
                d.fogEnd = d.scenery != null && w.farFog > 0f ? w.farFog : w.fogEnd;
                d.fogStart = d.scenery != null ? w.fogStart : 0.2f;
                d.lightColor = w.lightColor; d.lightIntensity = w.light; d.ambientColor = w.ambient; d.ambientKind = w.ambientKind;
                d.guideIntro = w.intro; d.showInMenu = w.menu;
                foreach (var (id, count) in w.creatures) d.creatures.Add(new WorldDefinition.Entry { creature = byId[id], count = count });
                worldList.Add(Save(d, Root + "/Definitions/Worlds/" + w.id + ".asset"));
            }

            var lib = ScriptableObject.CreateInstance<WorldLibrary>();
            lib.worlds = worldList.ToArray();
            lib.creatures = creatureList.ToArray();
            lib.toys = BuildToys();
            lib.snowPrefab = Prefab("Snowfall");
            lib.guidePrefab = Prefab("PLACEHOLDER_PenguinGuide");
            lib.skyMaterial = AssetDatabase.LoadAssetAtPath<Material>(Gen + "/Materials/M_SkyPanorama.mat");
            Save(lib, Root + "/Resources/WorldLibrary.asset");
            AssetDatabase.SaveAssets();
        }

        static partial void BuildWorldSceneImpl()
        {
            var scene = NewScene();
            SetEnvironment(new Color(0.62f, 0.66f, 0.72f), AssetDatabase.LoadAssetAtPath<Material>(Gen + "/Materials/M_SkyPanorama.mat"), 40f, Color.white);
            var sun = AddSun(Color.white, 1f, new Vector3(50, -30, 0));
            AddRig(false, false);

            var world = new GameObject("World");
            var wc = world.AddComponent<WorldController>();
            // White meshes: the world definition tints them.
            var ground = MeshObject("Ground", SaveMesh(new MeshBuilder().Disc(Vector3.zero, new Vector2(90, 90), Color.white, false, default, 40), "WorldGround"), world.transform);
            var platform = MeshObject("Platform", SaveMesh(new MeshBuilder()
                .Cylinder(new Vector3(0, -0.06f, 0), new Vector3(3.4f, 0.12f, 3.4f), Color.white, false, default, 1f, 28)
                .Cylinder(new Vector3(0, -0.2f, 0), new Vector3(2.6f, 0.2f, 2.6f), new Color(0.8f, 0.8f, 0.85f), false, default, 0.5f, 28), "WorldPlatform"), world.transform);
            var root = new GameObject("Creatures");
            root.transform.SetParent(world.transform, false);
            wc.sun = sun;
            wc.ground = ground.GetComponent<Renderer>();
            wc.platform = platform.GetComponent<Renderer>();
            wc.creatureRoot = root.transform;
            SaveScene(scene, AppState.SceneWorld);
        }
    }
}
