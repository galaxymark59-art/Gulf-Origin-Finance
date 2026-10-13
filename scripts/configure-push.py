"""Configure the owner's downloaded Firebase files without printing credentials."""
from pathlib import Path
import json, subprocess, sys
root=Path(__file__).resolve().parents[1]
folder=root/'.tools/firebase'
ref='zyrsakqocyjvfgauwdiz'
npm=r'C:\Program Files\nodejs\npm.cmd'
def run(args):
    result=subprocess.run(args,cwd=root,capture_output=True,text=True,encoding='utf-8',errors='replace')
    if result.returncode:
        raise RuntimeError('A configuration command failed; credentials were not printed. Command: '+str(args[0]))
    return result.stdout
def cli(*args):
    return run([npm,'exec','--yes','--package=supabase','--','supabase',*args,'--agent','no'])
def config():
    candidates=[]
    for file in folder.glob('*.json'):
        data=json.loads(file.read_text(encoding='utf-8-sig'))
        if data.get('type')=='service_account': sender=(file,data)
        if 'project_info' in data: candidates.append((file,data))
    if 'sender' not in locals(): raise RuntimeError('Save the Firebase sender JSON in .tools/firebase first.')
    matching=[(file,data) for file,data in candidates if data['project_info']['project_id']==sender[1]['project_id'] and any(c['client_info']['android_client_info']['package_name']=='com.gulforigin.finance' for c in data['client'])]
    if not matching: raise RuntimeError('The Android configuration does not match this Firebase project and com.gulforigin.finance.')
    sdk=matching[-1]
    if sender[1]['project_id']!='mcube-exporters': raise RuntimeError('Unexpected Firebase project. Review before proceeding.')
    env=folder/'sender.env'
    env.write_text('FCM_SERVICE_ACCOUNT_JSON='+json.dumps(json.dumps(sender[1],separators=(',',':')))+'\n',encoding='utf-8')
    try: cli('secrets','set','--project-ref',ref,'--env-file',str(env))
    finally: env.unlink(missing_ok=True)
    run([str(root/'.tools/gh/bin/gh.exe'),'secret','set','MCUBE_GOOGLE_SERVICES_JSON','--repo','galaxymark59-art/Gulf-Origin-Finance','--body',json.dumps(sdk[1],separators=(',',':'))])
    (root/'android/app/google-services.json').write_text(json.dumps(sdk[1],indent=2),encoding='utf-8')
    print('Firebase sender stored only in Supabase; Android SDK config stored in GitHub build secret. Project: '+sender[1]['project_id'])
def scheduler():
    raw=cli('projects','api-keys','--project-ref',ref,'--output','json')
    parsed=None
    decoder=json.JSONDecoder()
    for i,c in enumerate(raw):
        if c in '{[':
            try:
                parsed=decoder.raw_decode(raw[i:])[0]
                if isinstance(parsed,(dict,list)): break
            except json.JSONDecodeError: pass
    def key(value):
        if isinstance(value,dict):
            if value.get('name')=='service_role' and value.get('api_key'): return value['api_key']
            for child in value.values():
                found=key(child)
                if found:return found
        if isinstance(value,list):
            for child in value:
                found=key(child)
                if found:return found
    secret=key(parsed)
    if not secret: raise RuntimeError('The existing service-role key could not be read securely.')
    sql=folder/'scheduler-private.sql'
    sql.write_text("do $$begin if not exists(select 1 from vault.secrets where name='mcube-notification-service-key') then perform vault.create_secret('"+secret.replace("'","''")+"','mcube-notification-service-key','Existing project key for protected payment notification dispatch');end if;end;$$;\n"+(root/'database/configure-notifications.sql').read_text(),encoding='utf-8')
    try: cli('db','query','--linked','--project-ref',ref,'--file',str(sql))
    finally:sql.unlink(missing_ok=True)
    print('Protected asynchronous notification dispatcher and one-minute retry schedule configured.')
try:
    if len(sys.argv)>1 and sys.argv[1]=='scheduler': scheduler()
    else: config()
except Exception as error:
    print(str(error))
    sys.exit(1)
