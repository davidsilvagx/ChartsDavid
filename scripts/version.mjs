import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,data)=>fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');
const parse=v=>{if(!/^\d+\.\d+\.\d+$/.test(v))throw Error('Use versão no formato 0.1.0');return v.split('.').map(Number);};
const release=read('app-version.json'),pkg=read('package.json'),lock=read('package-lock.json');
const [command,...args]=process.argv.slice(2);
if(command==='bump'){
 const level=args[0],note=args[args.indexOf('--note')+1];
 if(!['patch','minor','major'].includes(level)||!args.includes('--note')||!note||note.startsWith('--'))throw Error('Use patch|minor|major --note "Descrição"');
 let [major,minor,patch]=parse(release.version);
 if(level==='major'){if(!args.includes('--stable'))throw Error('1.0.0 exige autorização explícita e --stable');major++;minor=0;patch=0;release.channel='stable';}
 else if(level==='minor'){minor++;patch=0;}else patch++;
 release.version=[major,minor,patch].join('.');release.releasedAt=new Date().toISOString().slice(0,10);
 pkg.version=release.version;lock.version=release.version;lock.packages[''].version=release.version;
 write('app-version.json',release);write('package.json',pkg);write('package-lock.json',lock);
 const path='CHANGELOG.md',old=fs.readFileSync(path,'utf8');
 fs.writeFileSync(path,old.replace('# Histórico de versões','# Histórico de versões\n\n## '+release.version+' · '+release.channel+' · '+release.releasedAt+'\n\n- '+note));
 console.log('Versão atualizada: '+release.version+' · '+release.channel);
}else if(command==='check'){
 const current=parse(release.version);
 if(pkg.version!==release.version||lock.version!==release.version||lock.packages?.['']?.version!==release.version)throw Error('Versões divergentes: execute npm run version:bump');
 if(!['beta','stable'].includes(release.channel)||(release.channel==='beta'&&current[0]>=1))throw Error('1.0.0 deve ser lançamento estável autorizado');
 if(!fs.readFileSync('CHANGELOG.md','utf8').includes('## '+release.version+' ·'))throw Error('Falta registro da versão no CHANGELOG');
 const base=args[0];
 if(base&&/^[a-f0-9]{7,40}$/.test(base)&&!/^0+$/.test(base)){
  const names=execFileSync('git',['diff','--name-only',base,'HEAD'],{encoding:'utf8'}).trim().split('\n');
  const runtime=names.some(n=>/^(src\/|server\/|api\/|functions\/|netlify\/functions\/|public\/|vite\.config|vercel\.json|index\.html|package(-lock)?\.json)/.test(n)&&!/(\.test\.[cm]?[jt]sx?$|\/tests\/)/.test(n));
  let prior;try{prior=JSON.parse(execFileSync('git',['show',base+':app-version.json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));}catch{/* Initial beta establishes formal versioning. */}
  if(prior&&runtime){const before=parse(prior.version);let greater=false;for(let i=0;i<3;i++){if(current[i]!==before[i]){greater=current[i]>before[i];break;}}if(!greater)throw Error('Mudança de produção sem nova versão. Leia AGENTS.md e execute npm run version:bump');}
 }
 console.log('Versão consistente: '+release.version+' · '+release.channel);
}else throw Error('Use bump ou check');
