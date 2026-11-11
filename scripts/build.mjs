import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import ts from 'typescript';
import { WorkspaceTypertGenerator, writePackageArtifacts } from '@deepseek-ai/dsh-typert-generator';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const uiCopy={},copyKeys={};
for(const name of ['ui-app.tsx','ui-visuals.tsx','ui-conversation.tsx','ui-conversation-progress.tsx','ui-discussion.tsx','ui-discussion-map.tsx']){
  const file=ts.createSourceFile(name,await readFile(path.join(root,'src',name),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const visit=node=>{if(ts.isStringLiteral(node)&&/[\u3400-\u9fff]/.test(node.text)){let hash=2166136261;for(const char of node.text)hash=Math.imul(hash^char.charCodeAt(0),16777619);const key=`m${(hash>>>0).toString(16)}`;if(uiCopy[key]&&uiCopy[key]!==node.text)throw Error('Locale key collision');uiCopy[key]=node.text;copyKeys[node.text]=key;}ts.forEachChild(node,visit);};visit(file);
}
await writeFile(path.join(root,'src/ui-copy.generated.ts'),`// Generated from product labels; business records are never translated.\nexport const uiCopy:Record<string,string>=${JSON.stringify(uiCopy)};\nexport const copyKeys:Record<string,string>=${JSON.stringify(copyKeys)};\n`);
// The official generator requires a packages/ layout. A private build mirror
// keeps that layout entirely inside this independent package.
const mirror = path.join(root, '.runtime', 'typert');
const pkg = path.join(mirror, 'packages', 'easy-ask-ai');
// The released generator recognizes decorator symbols only when their owning
// protocol package is registered in its workspace. Mirror the exact installed
// declaration package, without patching it or hand-writing Remote metadata.
const protocol = path.join(mirror, 'packages', 'typert-protocol');
await cp(path.join(root, 'node_modules/@deepseek-ai/dsh-typert-protocol'), protocol, { recursive: true });
await mkdir(pkg, { recursive: true });
await cp(path.join(root, 'src'), path.join(pkg, 'src'), { recursive: true });
await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ ...manifest, exports: { ...manifest.exports, './client': undefined } }, null, 2));
const options = { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true, esModuleInterop: true, lib: ['ES2022','DOM'], types: ['node'], declaration: true, outDir: 'lib/types', paths: { '@deepseek-ai/dsh-typert-protocol': [path.join(protocol,'lib/types/index.d.ts')] } };
await writeFile(path.join(pkg, 'tsconfig.host.json'), JSON.stringify({ compilerOptions: options, include: ['src/index.ts'] }));
await writeFile(path.join(protocol, 'tsconfig.host.json'), JSON.stringify({ compilerOptions: options, include: ['lib/types/**/*.d.ts'] }));
await writeFile(path.join(mirror, 'tsconfig.host.json'), JSON.stringify({ compilerOptions: options, files: [], references: [{path:'./packages/easy-ask-ai/tsconfig.host.json'}, {path:'./packages/typert-protocol/tsconfig.host.json'}] }));
console.log('Generating strict Remote metadata…');
const artifacts = new WorkspaceTypertGenerator(mirror).generate([manifest.name], ['host']);
if (!artifacts.length || !artifacts[0].remote) throw new Error('No Remote methods generated');
writePackageArtifacts(root, artifacts);
await mkdir(path.join(root,'lib/types'),{recursive:true});
for(const name of ['index','service','types']){
  const source=await readFile(path.join(root,`src/${name}.ts`),'utf8');
  const declaration=ts.transpileDeclaration(source,{fileName:`${name}.ts`,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,isolatedDeclarations:true}});
  if(declaration.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error(ts.formatDiagnosticsWithColorAndContext(declaration.diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
  await writeFile(path.join(root,`lib/types/${name}.d.ts`),declaration.outputText);
}
await writeFile(path.join(root,'lib/types/types.js'),'export {};\n');
console.log('Bundling native Host and Client…');
const dev=process.argv.includes('--dev');
const hostBuild=await build({ entryPoints:[path.join(root,'src/host.mjs')], outfile:path.join(root,'lib/index.js'), bundle:true, format:'esm', platform:'node', target:'node24', external:['@deepseek-ai/*','zod'], sourcemap:dev,metafile:true });
const cssText={name:'local-font-css',setup(builder){builder.onLoad({filter:/\.css$/},async({path:file})=>{let css=await readFile(file,'utf8');for(const match of [...css.matchAll(/url\((?:['"]?)([^)'"\s]+)(?:['"]?)\)/g)]){if(!match[1].startsWith('.'))continue;const bytes=await readFile(path.resolve(path.dirname(file),match[1]));css=css.replace(match[0],`url(data:font/woff2;base64,${bytes.toString('base64')})`);}return {contents:css,loader:'text'};});}};
const clientBuild=await build({ entryPoints:[path.join(root,'src/client.ts')], outfile:path.join(root,'lib/client.js'), bundle:true, format:'cjs', platform:'browser', target:'es2022', external:['react','react-dom','react/jsx-runtime','react-dom/client','@deepseek-ai/cordis'], plugins:[cssText], minify:true,define:{'process.env.NODE_ENV':'"production"','__EH3_DEV__':String(dev)},banner:{js:`window.__ModuleLoader__.load({id:${JSON.stringify(manifest.name)},factory(require){const module={exports:{}};const exports=module.exports;`}, footer:{js:'return module.exports;}});'}, sourcemap:dev,metafile:true });
await writeFile(path.join(root,'.runtime/build-meta.json'),JSON.stringify({inputs:{...hostBuild.metafile.inputs,...clientBuild.metafile.inputs}},null,2));
console.log(`Built ${manifest.name}: ${artifacts[0].remote ? 'generated strict Remote' : 'no Remote'}`);
