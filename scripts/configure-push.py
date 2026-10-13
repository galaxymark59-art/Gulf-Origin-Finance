"""Configure the owner's downloaded Firebase files without printing credentials."""
from pathlib import Path
import json, subprocess, sys, urllib.request, secrets
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
    env.write_text('FCM_SERVICE_ACCOUNT_JSON='+json.dumps(sender[1],separators=(',',':'))+'\n',encoding='utf-8')
    try: cli('secrets','set','--project-ref',ref,'--env-file',str(env))
    finally: env.unlink(missing_ok=True)
    run([str(root/'.tools/gh/bin/gh.exe'),'secret','set','MCUBE_GOOGLE_SERVICES_JSON','--repo','galaxymark59-art/Gulf-Origin-Finance','--body',json.dumps(sdk[1],separators=(',',':'))])
    (root/'android/app/google-services.json').write_text(json.dumps(sdk[1],indent=2),encoding='utf-8')
    print('Firebase sender stored only in Supabase; Android SDK config stored in GitHub build secret. Project: '+sender[1]['project_id'])
def scheduler():
    keyfile=folder/'dispatch-secret.txt'
    if not keyfile.exists(): keyfile.write_text(secrets.token_urlsafe(48),encoding='utf-8')
    secret=keyfile.read_text(encoding='utf-8').strip()
    env=folder/'dispatch.env';env.write_text('PAYMENT_DISPATCH_SECRET='+secret+'\n',encoding='utf-8')
    try: cli('secrets','set','--project-ref',ref,'--env-file',str(env))
    finally:env.unlink(missing_ok=True)
    sql=folder/'scheduler-private.sql'
    sql.write_text("do $$begin if not exists(select 1 from vault.secrets where name='mcube-payment-dispatch-secret') then perform vault.create_secret('"+secret.replace("'","''")+"','mcube-payment-dispatch-secret','Dedicated token for payment notification dispatch only');end if;end;$$;\ndelete from vault.secrets where name='mcube-notification-service-key';\n"+(root/'database/configure-notifications.sql').read_text(),encoding='utf-8')
    try: cli('db','query','--linked','--project-ref',ref,'--file',str(sql))
    finally:sql.unlink(missing_ok=True)
    print('Protected asynchronous notification dispatcher and one-minute retry schedule configured.')
    verify_backend()
def verify_backend():
    secret=(folder/'dispatch-secret.txt').read_text(encoding='utf-8').strip()
    endpoint='https://'+ref+'.supabase.co/functions/v1/payment-notifications'
    request=urllib.request.Request(endpoint,data=b'{"action":"validate"}',headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=30) as response:
            result=json.load(response)
            if result.get('sender_verified') is not True: raise RuntimeError('Notification backend did not confirm the sender credential.')
    except urllib.error.HTTPError as error:
        message=json.load(error).get('error','No diagnostic message')
        raise RuntimeError('Notification endpoint '+str(error.code)+': '+str(message))
    try:
        urllib.request.urlopen(urllib.request.Request(endpoint,data=b'{"action":"validate"}',headers={'Content-Type':'application/json'}),timeout=30)
        raise RuntimeError('Anonymous caller was not rejected.')
    except urllib.error.HTTPError as error:
        if error.code!=401:raise RuntimeError('Anonymous verification returned an unexpected status.')
    print('Deployed sender credential verified with Google OAuth; protected dispatch succeeds and anonymous calls are rejected. No notification sent.')
try:
    if len(sys.argv)>1 and sys.argv[1]=='scheduler': scheduler()
    elif len(sys.argv)>1 and sys.argv[1]=='verify': verify_backend()
    else: config()
except Exception as error:
    print(str(error))
    sys.exit(1)
