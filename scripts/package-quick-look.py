"""Build the Quick Look asset library from the three individual USDZ files."""
from pathlib import Path
from tempfile import TemporaryDirectory
from shutil import copyfile
import subprocess

models = Path(__file__).resolve().parents[1] / 'models'
items = ['sofa', 'armchair', 'table']
assets = ', '.join(f'@{name}.usdz@' for name in items)
variants = '\n'.join(
    f'        "{name}" (prepend references = @{name}.usdz@) {{}}' for name in items
)
scene = f'''#usda 1.0
(
    defaultPrim = "Object"
    upAxis = "Y"
    metersPerUnit = 1
    customLayerData = {{
        asset[] assetLibrary = [{assets}]
    }}
)
def Xform "Object" (
    variants = {{ string Assets = "{items[0]}" }}
    prepend variantSets = "Assets"
)
{{
    variantSet "Assets" = {{
{variants}
    }}
}}
'''
with TemporaryDirectory() as tmp:
    directory = Path(tmp)
    (directory / 'individual.usda').write_text(scene)
    for name in items:
        asset = models / f'{name}.usdz'
        metadata = subprocess.check_output(['usdcat', '--layerMetadata', str(asset)], text=True)
        metadata_lines = {line.strip() for line in metadata.splitlines()}
        # The enclosing stage defines the coordinate system for every referenced model.
        if not {'upAxis = "Y"', 'metersPerUnit = 1'} <= metadata_lines:
            raise SystemExit(f'{asset.name} must be exported Y-up with metres as stage units.')
        copyfile(asset, directory / asset.name)
    subprocess.run(
        ['usdzip', 'individual.usdz', 'individual.usda', *(f'{name}.usdz' for name in items)],
        cwd=directory, check=True,
    )
    copyfile(directory / 'individual.usdz', models / 'individual.usdz')
