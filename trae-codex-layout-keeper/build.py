from pathlib import Path
import json, zipfile
root=Path(__file__).resolve().parent
ext=root/'extension'
pkg=json.loads((ext/'package.json').read_text(encoding='utf-8'))
manifest=f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="{pkg['name']}" Version="{pkg['version']}" Publisher="{pkg['publisher']}"/><DisplayName>{pkg['displayName']}</DisplayName><Description xml:space="preserve">Keep Codex in the Trae right AI sidebar after compatible updates.</Description><Categories>Other</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.96.2"/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>'''
target=root/f"{pkg['name']}-{pkg['version']}.vsix"
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('extension.vsixmanifest',manifest)
    archive.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="md" ContentType="text/markdown"/></Types>')
    for f in ext.rglob('*'):
        if f.is_file():archive.write(f,'extension/'+f.relative_to(ext).as_posix())
print(target)
