# Furniture model credits

All models are public domain (CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/).
Attribution is not required; we credit the authors anyway. Loaded by
`src/lib/floorplan/three/furniture.ts`.

| File             | Source asset                                      | Author          | License | Source URL                                     |
| ---------------- | ------------------------------------------------- | --------------- | ------- | ---------------------------------------------- |
| sofa.glb         | Poly Haven "Sofa 02" (1k glTF, packed to GLB)     | Kirill Sannikov | CC0     | https://polyhaven.com/a/sofa_02                |
| table.glb        | Poly Haven "Dining Table" (1k glTF, packed)       | Aron Łyczek     | CC0     | https://polyhaven.com/a/dining_table           |
| table-coffee.glb | Poly Haven "Modern Coffee Table 01" (1k, packed)  | Amin            | CC0     | https://polyhaven.com/a/modern_coffee_table_01 |
| wardrobe.glb     | Poly Haven "Painted Wooden Cabinet" (1k, packed)  | Kirill Sannikov | CC0     | https://polyhaven.com/a/painted_wooden_cabinet |
| bed.glb          | Kenney Furniture Kit 2.0, `bedDouble.glb`         | Kenney          | CC0     | https://kenney.nl/assets/furniture-kit         |
| counter.glb      | Kenney Furniture Kit 2.0, `kitchenCabinet.glb`    | Kenney          | CC0     | https://kenney.nl/assets/furniture-kit         |
| fridge.glb       | Kenney Furniture Kit 2.0, `kitchenFridgeLarge.glb`| Kenney          | CC0     | https://kenney.nl/assets/furniture-kit         |
| tub.glb          | Kenney Furniture Kit 2.0, `bathtub.glb`           | Kenney          | CC0     | https://kenney.nl/assets/furniture-kit         |
| toilet.glb       | Kenney Furniture Kit 2.0, `toilet.glb`            | Kenney          | CC0     | https://kenney.nl/assets/furniture-kit         |
| sink.glb         | Kenney Furniture Kit 2.0, `bathroomSink.glb`      | Kenney          | CC0     | https://kenney.nl/assets/furniture-kit         |
| washer.glb       | Kenney Furniture Kit 2.0, `washer.glb`            | Kenney          | CC0     | https://kenney.nl/assets/furniture-kit         |

Poly Haven files were downloaded at 1k texture resolution from https://api.polyhaven.com and packed
with `@gltf-transform/cli copy`. Kenney files are unmodified copies from the kit zip (its
License.txt states CC0); they use `KHR_materials_unlit`, which `furniture.ts` swaps for lit
materials at load time.
