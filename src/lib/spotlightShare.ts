import { cacheImageUrl } from './canvas';
import { resolveCatalogMedia } from './catalog';
import type { Item } from './types';

export async function renderSpotlightCard({title,owner,period,items,award,dark,coverage,official,basis}:{title:string;owner:string;period:string;items:Array<Pick<Item,'id'|'name'|'artist'|'album'|'image'>&{plays?:number}>;award?:string;dark:boolean;coverage?:string;official?:string;basis?:string}){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Não foi possível criar o card.');
  await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1200))]);
  const covers=await Promise.all(items.slice(0,5).map(async item=>{const url=item.image||(await resolveCatalogMedia(item))?.artworkUrl||'';return cacheImageUrl(url);}));
  const bg=dark?'#090e17':'#f3f5fa',fg=dark?'#f6f8fc':'#111c2e',muted=dark?'#a3b3c8':'#586a80',accent=award?(dark?'#e9bd65':'#9a5a10'):dark?'#43dfa1':'#067a60';
  ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1350);
  if(covers[0]){ctx.save();ctx.globalAlpha=.4;ctx.filter='blur(42px)';ctx.drawImage(covers[0],-160,-40,1400,1400);ctx.restore();}
  const fade=ctx.createLinearGradient(0,0,0,1000);fade.addColorStop(0,dark?'rgba(9,14,23,.08)':'rgba(243,245,250,.12)');fade.addColorStop(1,dark?'rgba(9,14,23,.78)':'rgba(243,245,250,.72)');ctx.fillStyle=fade;ctx.fillRect(0,0,1080,1350);
  ctx.save();ctx.strokeStyle=fg;ctx.globalAlpha=.035;ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<1080;x+=96){ctx.moveTo(x,0);ctx.lineTo(x,1350);}for(let y=0;y<1350;y+=96){ctx.moveTo(0,y);ctx.lineTo(1080,y);}ctx.stroke();ctx.restore();
  const font=(weight:number,size:number)=>`${weight} ${size}px 'Plus Jakarta Sans',sans-serif`;
  const text=(value:string,x:number,y:number,width:number)=>{let s=value;while(s.length>1&&ctx.measureText(s).width>width)s=s.slice(0,-1);ctx.fillText(s===value?s:`${s.slice(0,-1)}…`,x,y);};
  ctx.fillStyle=accent;ctx.font=font(800,23);ctx.fillText(award?'LASTCHART · AWARDS':'LASTCHART · SPOTLIGHT',64,76);
  ctx.fillStyle=fg;ctx.font=font(800,48);text(title,64,147,952);
  ctx.fillStyle=muted;ctx.font=font(500,22);text(period,64,192,952);
  if(coverage){ctx.font=font(500,18);text(coverage,64,227,952);}
  if(award){
    ctx.fillStyle=accent;ctx.font=font(700,25);text(award,64,266,952);
    ctx.save();ctx.beginPath();ctx.roundRect(270,292,540,540,40);ctx.clip();ctx.fillStyle=dark?'#172334':'#e0e6ef';ctx.fillRect(270,292,540,540);if(covers[0])ctx.drawImage(covers[0],270,292,540,540);ctx.restore();
    ctx.fillStyle=fg;ctx.font=font(800,43);text(items[0]?.name??'Sem dados',64,910,952);
    ctx.fillStyle=muted;ctx.font=font(500,28);text(items[0]?.artist??'',64,960,952);
    if((items[0]?.plays??0)>0){ctx.fillStyle=accent;ctx.font=font(700,28);ctx.fillText(`${items[0].plays!.toLocaleString('pt-BR')} reproduções no período`,64,1020);}
    ctx.fillStyle=muted;ctx.font=font(500,21);
    if(official){text(`Categoria: ${official} · ${basis??'voto pessoal'}`,64,1080,952);text('Simulação pessoal independente; não é resultado oficial da Recording Academy.',64,1120,952);}
    else ctx.fillText('Premiação pessoal baseada no histórico sincronizado.',64,1120);
  }else{
    items.slice(0,5).forEach((item,i)=>{
      const y=270+i*174;
      ctx.fillStyle=dark?'rgba(255,255,255,.05)':'rgba(255,255,255,.72)';ctx.beginPath();ctx.roundRect(48,y-14,984,156,26);ctx.fill();
      ctx.fillStyle=accent;ctx.font=font(800,29);ctx.fillText(String(i+1).padStart(2,'0'),72,y+66);
      ctx.save();ctx.beginPath();ctx.roundRect(132,y+2,124,124,20);ctx.clip();ctx.fillStyle=dark?'#203047':'#dbe4ef';ctx.fillRect(132,y+2,124,124);if(covers[i])ctx.drawImage(covers[i]!,132,y+2,124,124);ctx.restore();
      ctx.fillStyle=fg;ctx.font=font(750,29);text(item.name,282,y+36,708);ctx.fillStyle=muted;ctx.font=font(500,23);text(item.artist,282,y+74,708);ctx.fillStyle=accent;ctx.font=font(700,23);ctx.fillText(`${(item.plays??0).toLocaleString("pt-BR")} plays`,282,y+112);
    });
  }
  ctx.fillStyle=fg;ctx.font=font(700,24);text(owner,64,1226,952);
  ctx.fillStyle=muted;ctx.font=font(500,18);ctx.fillText('Charts pessoais · dados disponíveis no período indicado',64,1270);
  ctx.globalAlpha=.65;ctx.font=font(500,15);ctx.fillText('feito com ❤️ por william santos',64,1313);ctx.globalAlpha=1;
  return canvas;
}
