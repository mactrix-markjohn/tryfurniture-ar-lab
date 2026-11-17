# TryFurniture AR test

A static, phone-first prototype for placing premade furniture in a real room. The root of `main` can be published with GitHub Pages. A phone needs an HTTPS URL for live camera access.

## Phone test

Open the page in Safari on iPhone. Open it in Chrome on an ARCore-supported Android phone for the WebXR test.

1. **Quick Look, individual pieces.** Open the nested USDZ. Try to move and rotate the chair without moving the sofa or table. Record whether your iOS version shows three pieces or treats them as a unit.
2. **Quick Look, complete layout.** Place the prearranged set and walk around it. It uses an invisible parent and fixed physical scale. Note whether the entire arrangement moves together.
3. **8th Wall live editor.** Point slowly at a textured floor. Select and add a sofa, an armchair and a table. Select the placed chair, tap **Move**, then tap the floor at the new spot. Rotate with the 15° buttons. Select **Lounge chair** in the catalogue and tap **Swap**. Check that the position and rotation remain the same.
4. **Native WebXR comparison.** Use the same workflow in supported Android Chrome. Aim the ring at the desired floor point, then tap the camera view to place or move a piece.
5. **Scale and drift.** Mark the expected chair and table positions with tape. Walk to the other side of the room, look away, and return. Repeat on a glossy or tiled floor. Compare the final positions, overall scale and responsiveness with three pieces and then eight.
6. **Save and restore.** Save a layout, exit, then restart and tap **Restore**. Face the same direction and set the layout down at the original floor point. Save stores each item’s relative position and rotation in the current browser. Restore asks for a new floor point each time.

## Optional Variant Launch comparison

Create or use a Variant Launch project and authorize the deployed domain. Open the site with `?variantKey=YOUR_PUBLISHABLE_SDK_KEY` to reveal the Variant launch button. The iPhone test goes through Variant’s Safari App Clip prompt. The key is client-side and is never included in the repository. Android uses the same native WebXR path.

## Assets

The test uses CC0 [Poly Haven models](https://polyhaven.com/license): [Sofa 02](https://polyhaven.com/a/sofa_02), [Modern Arm Chair](https://polyhaven.com/a/modern_arm_chair_01), [Modern Coffee Table](https://polyhaven.com/a/modern_coffee_table_01) and [Mid Century Lounge Chair](https://polyhaven.com/a/mid_century_lounge_chair). Models are normalized to test dimensions listed in `models/catalogue.json` as width, height, depth in metres. These dimensions apply to the test assets.

The Quick Look library can be rebuilt on macOS with `python3 scripts/package-quick-look.py` and Apple's `usdzip` tool. The separate grouped layout has scene transforms authored into the USDZ.
