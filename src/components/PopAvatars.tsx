import type { AvatarPreset } from './Avatars';

// Original vector portraits inspired by pop stage aesthetics, drawn for the app.
const divas = [
  ['madonna','Madonna','#d9b8ff','#f7daa5','#eac180','waves'],
  ['miley','Miley Cyrus','#9bdcce','#eed0b2','#ad7345','mullet'],
  ['selena','Selena Gomez','#e4a7be','#d7a07f','#231a25','bob'],
  ['gaga','Lady Gaga','#c5e8ee','#f1c7b5','#e7e1df','fringe'],
  ['beyonce','Beyoncé','#edc674','#ad724c','#b58042','waves'],
  ['rihanna','Rihanna','#89b6d8','#b97957','#231821','bob'],
  ['ariana','Ariana Grande','#b2a3ef','#ddb18f','#6f432d','pony'],
  ['taylor','Taylor Swift','#aaccc5','#f2cdb2','#c29556','fringe'],
  ['britney','Britney Spears','#abb5ed','#edbc9a','#e1b468','long'],
  ['dua','Dua Lipa','#9cbed1','#d3a184','#29212b','long'],
  ['shakira','Shakira','#e6ac74','#d2a16d','#bf873e','waves'],
  ['katy','Katy Perry','#c4b6e4','#e0b097','#27222e','fringe'],
] as const;

export const POP_AVATARS: AvatarPreset[] = divas.map(([id,name,accent,skin,hair,style]) => ({
  id:`pop-${id}`,name,vibe:'Pop Icons · ilustração',accent,
  render:uid=><>
    <defs><linearGradient id={`${uid}-pop`} x2="1" y2="1"><stop stopColor={accent}/><stop offset="1" stopColor="#122938"/></linearGradient><radialGradient id={`${uid}-light`}><stop stopColor={accent} stopOpacity=".6"/><stop offset="1" stopColor={accent} stopOpacity="0"/></radialGradient></defs>
    <rect width="80" height="80" rx="20" fill={`url(#${uid}-pop)`}/>
    <circle cx="60" cy="21" r="35" fill={`url(#${uid}-light)`}/>
    <path d="M18 80V37C18 7 61 5 63 36L66 80Z" fill={hair}/>
    {style==='waves'&&<path d="M21 20Q6 31 15 44Q5 57 17 68L12 80H69L66 58Q76 46 65 32Q70 12 50 12Z" fill={hair}/>}
    {style==='pony'&&<><path d="M48 16Q76 3 71 48L78 70L59 65L58 29Z" fill={hair}/><ellipse cx="40" cy="13" rx="15" ry="8" fill={hair}/></>}
    <path d="M12 80Q17 61 33 60H48Q65 62 70 80Z" fill="#15232e"/>
    <path d="M33 51V63Q40 71 48 62V50" fill={skin}/>
    <ellipse cx="40" cy="36" rx="17" ry="23" fill={skin}/>
    <path d="M24 30Q22 10 41 12Q61 12 58 35Q50 25 45 20Q35 29 24 30Z" fill={hair}/>
    {(style==='fringe'||style==='mullet')&&<path d="M24 27L27 18H53L57 31L49 27L46 30L39 26L33 30Z" fill={hair}/>}
    {style==='bob'&&<path d="M23 25Q17 39 25 57L31 57Q25 41 28 24M53 22Q64 41 55 58H49Q57 39 51 25" stroke={hair} strokeWidth="6" fill="none"/>}
    {style==='mullet'&&<path d="M22 35L17 57L27 67L29 49M58 34L65 59L55 66L52 50" fill={hair}/>}
    <path d="M29 34Q33 31 36 34M45 34Q49 31 52 34" stroke="#4b2e35" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    <path d="M29 38L35 38M46 38L52 37" stroke="#292335" strokeWidth="1.7" strokeLinecap="round"/>
    <path d="M40 40L38 46L42 46" stroke="#a66e60" strokeWidth="1" strokeLinecap="round" fill="none"/>
    <path d="M34 50Q40 47 47 50Q40 55 34 50" fill="#af3858"/>
    <circle cx="23" cy="44" r="2" fill={accent}/><circle cx="58" cy="44" r="2" fill={accent}/>
    <path d="M32 65L40 74L49 65" stroke={accent} strokeWidth="1.3" fill="none"/>
    <path d="M9 14H15M12 11V17" stroke="#fff" strokeOpacity=".65" strokeWidth="1.4" strokeLinecap="round"/>
    <circle cx="66" cy="67" r="4" fill="#22dc6e" stroke="#15232e" strokeWidth="2"/>
  </>,
}));
