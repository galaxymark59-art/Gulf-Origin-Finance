"""Validate messaging access without sending a notification or printing credentials."""
from pathlib import Path
import json,time,base64,urllib.request,urllib.parse
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding
folder=Path(__file__).resolve().parents[1]/'.tools/firebase'
account=next(json.loads(f.read_text()) for f in folder.glob('*.json') if json.loads(f.read_text()).get('type')=='service_account')
def b64(value):return base64.urlsafe_b64encode(value).decode().rstrip('=')
now=int(time.time());head=b64(json.dumps({'alg':'RS256','typ':'JWT'}).encode());body=b64(json.dumps({'iss':account['client_email'],'scope':'https://www.googleapis.com/auth/firebase.messaging','aud':'https://oauth2.googleapis.com/token','iat':now,'exp':now+3600}).encode());unsigned=head+'.'+body
key=serialization.load_pem_private_key(account['private_key'].encode(),None)
assertion=unsigned+'.'+b64(key.sign(unsigned.encode(),padding.PKCS1v15(),hashes.SHA256()))
try:
 data=urllib.parse.urlencode({'grant_type':'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion':assertion}).encode()
 token=json.load(urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token',data=data),timeout=20))['access_token']
 request=urllib.request.Request('https://fcm.googleapis.com/v1/projects/'+account['project_id']+'/messages:send',data=json.dumps({'validate_only':True,'message':{'topic':'mcube-configuration-validation','notification':{'title':'Mcube Exporters','body':'Configuration validation only.'}}}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=20) as response:print('Firebase messaging credential and HTTP v1 permissions verified. Validation only; no message sent.')
except urllib.error.HTTPError as error:
 details=json.load(error)
 print('Firebase validation failed: '+details.get('error',{}).get('status','HTTP '+str(error.code)))
 raise SystemExit(1)
