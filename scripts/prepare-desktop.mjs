import {cp,readFile,writeFile} from 'node:fs/promises';
const root=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const file=new URL('../desktop/package.json',import.meta.url),desktop=JSON.parse(await readFile(file,'utf8'));
desktop.version=root.version;await writeFile(file,JSON.stringify(desktop,null,2)+'\n');
await cp(new URL('../dist/',import.meta.url),new URL('../desktop/web/',import.meta.url),{recursive:true,force:true});
console.log('Windows app assets prepared.');
