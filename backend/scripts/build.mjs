import {readFile,writeFile,mkdir,rm,readdir,copyFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
const assets=Object.fromEntries(await Promise.all((await readdir('public')).map(async name=>[name,await readFile('public/'+name,'utf8')])));
await writeFile('dist/server/index.js','const assets='+JSON.stringify(assets)+';\n'+await readFile('worker/index.js','utf8'));
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built Worker and '+Object.keys(assets).length+' embedded assets');
