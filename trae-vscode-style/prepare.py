from pathlib import Path
import json, shutil, zipfile, re
from datetime import datetime

ROOT = Path(__file__).resolve().parent
TRAE = Path(r'C:\Users\15634\AppData\Local\Programs\Trae CN\resources\app')
SOURCE = TRAE / 'extensions/theme-icube/themes'
EXT = ROOT / 'extension'
EXT.mkdir(parents=True, exist_ok=True)
(EXT / 'themes').mkdir(exist_ok=True)

def load_theme(name):
    obj = json.loads((SOURCE / name).read_text(encoding='utf-8'))
    base = load_theme(obj['include']) if 'include' in obj else {}
    result = {**base, **obj}
    result.pop('include', None)
    result['colors'] = {**base.get('colors', {}), **obj.get('colors', {})}
    result['tokenColors'] = base.get('tokenColors', []) + obj.get('tokenColors', [])
    result['semanticTokenColors'] = {**base.get('semanticTokenColors', {}), **obj.get('semanticTokenColors', {})}
    return result

themes = []
for name, source, kind in [('Deep Blue', 'dark_blue.json', 'vs-dark'), ('Dark', 'dark_plus.json', 'vs-dark'), ('Light', 'light.json', 'vs')]:
    theme = load_theme(source)
    theme['name'] = f'Trae {name}'
    colors = theme['colors']
    # Trae uses these private colors in its workbench CSS. Map its surfaces to
    # public VS Code theme colors so they also work without Trae's renderer.
    bg = colors.get('icube.colorBg1', colors.get('editor.background', '#181D27'))
    chrome = colors.get('icube.colorBg2', '#232A35' if kind == 'vs-dark' else '#F3F3F3')
    border = colors.get('icube.colorLine1', '#B0C0F414' if kind == 'vs-dark' else '#00000014')
    fg = colors.get('foreground', '#D1D3DB' if kind == 'vs-dark' else '#333333')
    colors.update({
        'panel.background': bg,
        'editorGroup.emptyBackground': bg,
        'editorGutter.background': bg,
        'sideBarTitle.background': bg,
        'sideBarTitle.foreground': fg,
        'statusBar.background': chrome,
        'statusBar.noFolderBackground': chrome,
        'statusBar.debuggingBackground': chrome,
        'statusBar.foreground': colors.get('descriptionForeground', fg),
        'statusBar.noFolderForeground': colors.get('descriptionForeground', fg),
        'statusBar.border': border,
        'sideBar.border': border,
        'panel.border': border,
        'editorGroup.border': border,
        'editorGroupHeader.tabsBackground': bg,
        'tab.inactiveBackground': bg,
        'tab.activeBackground': chrome,
        'tab.activeBorderTop': '#00000000',
        'tab.unfocusedActiveBorderTop': '#00000000',
        'titleBar.border': border,
        'button.separator': border,
        'gitDecoration.modifiedResourceForeground': '#DCCF56' if kind == 'vs-dark' else '#9F7500',
        'gitDecoration.untrackedResourceForeground': '#00A56E' if kind == 'vs-dark' else '#00895C',
    })
    theme['colors'] = {k: v for k, v in colors.items() if not k.startswith('icube') and re.fullmatch(r'#[0-9a-fA-F]{3,8}', v)}
    target = name.lower().replace(' ', '-') + '.json'
    (EXT / 'themes' / target).write_text(json.dumps(theme, ensure_ascii=False, indent=2), encoding='utf-8')
    themes.append({'id': f'Trae {name}', 'label': f'Trae {name}', 'uiTheme': kind, 'path': f'./themes/{target}'})

shutil.copytree(TRAE / 'extensions/theme-seti/icons', EXT / 'icons', dirs_exist_ok=True)
package = {
    'name': 'trae-local-themes', 'displayName': 'Trae Local Themes',
    'description': 'Local adaptation of the themes and file icons from your installed Trae CN.',
    'version': '1.0.0', 'publisher': 'local-style', 'license': 'SEE LICENSE IN NOTICE.md',
    'engines': {'vscode': '^1.85.0'}, 'categories': ['Themes'],
    'contributes': {'themes': themes, 'iconThemes': [{'id': 'trae-local-icons', 'label': 'Trae File Icons', 'path': './icons/icube-seti-icon-theme.json'}]},
}
(EXT / 'package.json').write_text(json.dumps(package, indent=2), encoding='utf-8')
(EXT / 'NOTICE.md').write_text('Local personal adaptation of assets from the installed Trae CN. Original theme manifests declare MIT; Seti icon assets originate from Microsoft VS Code and jesseweed/seti-ui. Keep original asset notices. No extension runtime code is included.\n', encoding='utf-8')
manifest = '''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="trae-local-themes" Version="1.0.0" Publisher="local-style"/><DisplayName>Trae Local Themes</DisplayName><Description xml:space="preserve">Local Trae themes and file icons</Description><Categories>Themes</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.85.0"/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>'''
with zipfile.ZipFile(ROOT / 'trae-local-themes-1.0.0.vsix', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('extension.vsixmanifest', manifest)
    archive.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="woff" ContentType="application/font-woff"/><Default Extension="png" ContentType="image/png"/><Default Extension="md" ContentType="text/markdown"/></Types>')
    for path in EXT.rglob('*'):
        if path.is_file(): archive.write(path, 'extension/' + path.relative_to(EXT).as_posix())

settings_path = Path(r'C:\Users\15634\AppData\Roaming\Code\User\settings.json')
backup = ROOT / ('backup-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir()
shutil.copy2(settings_path, backup / 'settings.json')
shutil.copy2(Path(r'C:\Users\15634\.vscode\extensions\extensions.json'), backup / 'extensions.json')
settings = json.loads(settings_path.read_text(encoding='utf-8-sig'))
settings.update({
    'workbench.colorTheme': 'Trae Deep Blue',
    'workbench.preferredDarkColorTheme': 'Trae Deep Blue',
    'workbench.preferredLightColorTheme': 'Trae Light',
    'window.autoDetectColorScheme': False,
    'workbench.iconTheme': 'trae-local-icons',
    'editor.fontFamily': "'JetBrains Mono', Consolas, 'Microsoft YaHei', monospace",
    'editor.fontSize': 14,
    'editor.fontWeight': 'normal',
    'editor.fontLigatures': False,
    'editor.lineHeight': 0,
    'editor.letterSpacing': 0,
    'terminal.integrated.fontFamily': "'JetBrains Mono', Consolas, 'Microsoft YaHei', monospace",
    'terminal.integrated.fontSize': 13,
    'debug.console.fontFamily': "'JetBrains Mono', Consolas, monospace",
    'window.titleBarStyle': 'custom',
    'window.density.editorTabHeight': 'compact',
    'workbench.tree.indent': 16,
    'workbench.tree.renderIndentGuides': 'onHover',
    'workbench.list.smoothScrolling': True,
    'editor.minimap.enabled': False,
    'breadcrumbs.enabled': False,
    'editor.smoothScrolling': True,
    'editor.cursorSmoothCaretAnimation': 'on',
})
settings_path.write_text(json.dumps(settings, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')
(ROOT / 'backup-path.txt').write_text(str(backup), encoding='utf-8')
print(json.dumps({'backup': str(backup), 'vsix': str(ROOT / 'trae-local-themes-1.0.0.vsix'), 'themes': [t['id'] for t in themes]}, ensure_ascii=False))
