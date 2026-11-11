// Copy licenses for dependencies actually included by the production bundler.
import {readFile,writeFile,readdir,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const meta=JSON.parse(await readFile(path.join(root,'.runtime/build-meta.json'),'utf8'));
const names=new Set(['@fontsource-variable/noto-sans-sc']);
for(const input of Object.keys(meta.inputs)){const match=input.replaceAll('\\','/').match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/);if(match)names.add(match[1]);}
await mkdir(path.join(root,'licenses'),{recursive:true});
const records=[],missing=[];
const supplements=JSON.parse(await readFile(path.join(root,'licenses/upstream/sources.json'),'utf8'));
for(const name of [...names].sort()){
 const dir=path.join(root,'node_modules',name);const pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));
 const candidates=(await readdir(dir)).filter(x=>/^(?:licen[cs]e|copying|ofl|notice)(?:\.|$)/i.test(x));
 const copied=[];for(const file of candidates){const destination=`${name.replaceAll('/','__')}__${file}`;await cp(path.join(dir,file),path.join(root,'licenses',destination));copied.push(destination);}
 const supplement=supplements[name];
 if(!copied.length&&supplement){copied.push(supplement.file);if(supplement.attribution)copied.push(supplement.attribution);}
 if(!copied.length)missing.push(name);
 records.push({name,version:pkg.version,license:pkg.license,files:copied,...(supplement?{supplement}:{})});
}
await writeFile(path.join(root,'licenses/index.json'),JSON.stringify(records,null,2)+'\n');
console.log(JSON.stringify({bundledPackages:records.length,missing}));
if(missing.length)process.exitCode=1;
