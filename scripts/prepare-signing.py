"""Create a persistent private APK signer and put its values in repository secrets."""
from pathlib import Path
from datetime import datetime,timedelta,timezone
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
import secrets,json,base64,subprocess
root=Path(__file__).resolve().parents[1];folder=root/'.tools/signing';folder.mkdir(parents=True,exist_ok=True)
keyfile=folder/'mcube-upload.p12';passwordfile=folder/'signing.json'
if not keyfile.exists():
    password=secrets.token_urlsafe(36);key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
    subject=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Mcube Exporters Android')]);now=datetime.now(timezone.utc)
    cert=x509.CertificateBuilder().subject_name(subject).issuer_name(subject).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=365*30)).sign(key,hashes.SHA256())
    keyfile.write_bytes(pkcs12.serialize_key_and_certificates(b'mcube',key,cert,None,serialization.BestAvailableEncryption(password.encode())))
    passwordfile.write_text(json.dumps({'alias':'mcube','password':password}),encoding='utf-8')
data=json.loads(passwordfile.read_text());cert=pkcs12.load_key_and_certificates(keyfile.read_bytes(),data['password'].encode())[1]
for name,value in {'MCUBE_SIGNING_KEY':base64.b64encode(keyfile.read_bytes()).decode(),'MCUBE_SIGNING_PASSWORD':data['password'],'MCUBE_SIGNING_ALIAS':data['alias']}.items():
    subprocess.run([str(root/'.tools/gh/bin/gh.exe'),'secret','set',name,'--repo','galaxymark59-art/Gulf-Origin-Finance'],input=value,text=True,check=True,capture_output=True)
print('Persistent APK signing secrets configured. Certificate SHA256: '+cert.fingerprint(hashes.SHA256()).hex())
