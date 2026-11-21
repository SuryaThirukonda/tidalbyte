# Bubby

The toy behind "scan a toy". Bubby is the team's own soft toy: a brown plush that lies on its belly.

- **The model is made by code**, like every other creature: `CreatureMeshes.Bubby()` in
  `Assets/WishWorld/Editor/CreatureMeshes.cs`, built into a prefab and a definition by
  `Assets/WishWorld/Editor/Builder.Toy.cs` when you run **WishWorld > Rebuild All**. Its name, greeting and fact are
  constants in `Builder.Toy.cs`.
- **The reference photographs are not in the repository.** They were taken at home, so `source~/` is git-ignored
  (the `~` also keeps Unity from importing it). Put `IMG_1270.jpg` to `IMG_1274.jpg` and `contact_sheet.jpg` there
  if you want to compare the model against them. The app never uses them.
- **Nothing here is captured by the headset.** The scan in the app is a staged animation
  (`Assets/WishWorld/Scripts/Worlds/ToyScan.cs`) that ends with this prepared model appearing.
- To check the model after changing it, render it from four sides: see `Logs/verification/toy/01_bubby_model.png`.
- `WISHWORLD_TOY=off` in `.env` removes the toy and the scan (see `.env.example`).
