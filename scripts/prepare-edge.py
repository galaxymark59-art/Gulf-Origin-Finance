from pathlib import Path
root=Path(__file__).resolve().parents[1]
shared=(root/'supabase/functions/_shared/user-admin.ts').read_text(encoding='utf-8')
index=(root/'supabase/functions/manage-users/index.ts').read_text(encoding='utf-8').replace('import { handleUserAdmin } from "../_shared/user-admin.ts";','')
(root/'.tools/manage-users-deploy.ts').write_text(shared+'\n'+index,encoding='utf-8')
print('Single-file manage-users deployment prepared.')
