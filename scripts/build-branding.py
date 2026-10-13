"""Generate the new Mcube mark from vector coordinates; retain app/database IDs."""
from pathlib import Path
from PIL import Image, ImageDraw
import base64, json

root=Path(__file__).resolve().parents[1]
points=[(24,68),(24,28),(32,28),(48,47),(64,28),(72,28),(72,68),(61,68),(61,47),(48,63),(35,47),(35,68)]
path='M24 68V28H32L48 47L64 28H72V68H61V47L48 63L35 47V68Z'
svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#4e6c86"/><path d="{path}" fill="#fff"/><path d="M25 77H71" stroke="#d1b681" stroke-width="3" stroke-linecap="round"/></svg>'
(root/'public/logo.svg').write_text(svg,encoding='utf-8')
def icon(size,foreground=False):
    scale=4
    image=Image.new('RGBA',(size*scale,size*scale),(0,0,0,0));d=ImageDraw.Draw(image)
    unit=size*scale/96
    if not foreground:d.rounded_rectangle((0,0,size*scale-1,size*scale-1),radius=24*unit,fill='#4e6c86')
    d.polygon([(x*unit,y*unit) for x,y in points],fill='white')
    d.line((25*unit,77*unit,71*unit,77*unit),fill='#d1b681',width=max(1,round(3*unit)))
    return image.resize((size,size),Image.Resampling.LANCZOS)
icon(192).save(root/'public/logo.png')
data='data:image/png;base64,'+base64.b64encode((root/'public/logo.png').read_bytes()).decode()
(root/'src/branding.ts').write_text('export const mcubeLogo = '+json.dumps(data)+';\n',encoding='utf-8')
file=root/'src/domain.ts';text=file.read_text(encoding='utf-8')
if 'import { mcubeLogo }' not in text:text='import { mcubeLogo } from "./branding";\n'+text
text=text.replace('  logo: "",','  logo: mcubeLogo,');file.write_text(text,encoding='utf-8')
file=root/'supabase/migrations/20261013083414_mcube_finance.sql';text=file.read_text(encoding='utf-8')
if '-- Current Mcube logo' not in text:text=text.replace('\ncommit;','\n-- Current Mcube logo; historical snapshots remain unchanged.\nupdate public.business_profiles set body=jsonb_set(body,\'{logo}\',to_jsonb(\''+data+'\'::text));\ncommit;')
text=text.replace("'members',private.team_names(),","'members',private.team_names(),")
text=text.replace("declare oid uuid:=private.business_id();result jsonb;begin\n", "declare oid uuid:=private.business_id();result jsonb;begin\n perform private.touch_activity();\n")
file.write_text(text,encoding='utf-8')
res=root/'android/app/src/main/res'
for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    for name in ['ic_launcher.png','ic_launcher_round.png','ic_launcher_foreground.png']:
        icon(round(size*2.25) if name.endswith('foreground.png') else size, name.endswith('foreground.png')).save(res/f'mipmap-{density}'/name)
for file in res.glob('drawable*/splash.png'):
    with Image.open(file) as old:size=old.size
    canvas=Image.new('RGB',size,'#4e6c86');mark=icon(round(min(size)*0.20),True);canvas.paste(mark,((size[0]-mark.width)//2,(size[1]-mark.height)//2),mark);canvas.save(file)
vector=f'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><group android:translateX="6" android:translateY="6"><path android:fillColor="#ffffff" android:pathData="{path}"/><path android:strokeColor="#D1B681" android:strokeWidth="3" android:pathData="M25,77 L71,77"/></group></vector>'
(res/'drawable/gulf_logo.xml').write_text(vector,encoding='utf-8')
(res/'drawable-v24/ic_launcher_foreground.xml').write_text(vector,encoding='utf-8')
for rel in ['index.html','public/manifest.webmanifest','android/app/src/main/res/values/strings.xml','android/app/src/main/java/com/gulforigin/finance/SecureVaultPlugin.java']:
    file=root/rel;text=file.read_text(encoding='utf-8').replace('Gulf Origin International','Mcube Exporters').replace('Gulf Origin Finance','Mcube Exporters').replace('Gulf Origin','Mcube Exporters');file.write_text(text,encoding='utf-8')
file=root/'package-lock.json';text=file.read_text(encoding='utf-8').replace('"version": "1.0.1"','"version": "1.1.0"',2);file.write_text(text,encoding='utf-8')
print('Generated Mcube assets and current branding; application ID and storage identifiers preserved.')
