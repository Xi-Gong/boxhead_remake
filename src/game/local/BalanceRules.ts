// PVE_BALANCE: versioned deterministic tuning. No RNG, timers, renderer state or dynamic difficulty.
export const BALANCE_RULE='pve-balance-v1';
export const DIFFICULTY_START_WAVES=[1,10,20,35] as const;
export const BALANCE_PROFILES=[
  {name:'Beginner',zombies:40,devils:2,spawnBase:25,spawnSlope:.55,spawnFloor:4,zombieSpeed:4,devilSpeed:3.2,devilCadence:1},
  {name:'Intermediate',zombies:44,devils:3,spawnBase:24,spawnSlope:.65,spawnFloor:3,zombieSpeed:4.3,devilSpeed:3.6,devilCadence:.9},
  {name:'Expert',zombies:48,devils:4,spawnBase:23,spawnSlope:.75,spawnFloor:2,zombieSpeed:4.6,devilSpeed:4,devilCadence:.8},
  {name:'Nightmare',zombies:56,devils:5,spawnBase:22,spawnSlope:.85,spawnFloor:1,zombieSpeed:4.8,devilSpeed:4.5,devilCadence:.7},
] as const;
export function difficultyIndex(value:number):number{return Number.isFinite(value)?Math.max(0,Math.min(3,Math.floor(value))):0;}
export function balancedWave(wave:number,difficulty:number,fps=25){
  const w=Math.max(1,Math.min(100,Math.floor(wave))),p=BALANCE_PROFILES[difficultyIndex(difficulty)]!;
  return {
    Zombie_SpawnRate:Math.max(p.spawnFloor,Math.round((p.spawnBase-p.spawnSlope*(w-1))*fps/25)),
    Zombie_Count:Math.min(10+5*(w-1),p.zombies),
    Zombie_TotalCount:10+5*(w-1),
    Devil_SpawnRate:Math.max(Math.round(2*fps),Math.round((10*fps-(w-1)*fps/25)*p.devilCadence)),
    Devil_Count:Math.min(w===1?0:Math.floor(1+.3*(w-2)),p.devils,w===1?0:Math.floor(1+(w-2)/4)),
    Devil_TotalCount:w===1?0:Math.floor(1+(w-2)/4),
    zombieSpeed:Math.min(1.1+.085*(w-1),p.zombieSpeed),
    devilSpeed:Math.min(1.1+.07*(w-1),p.devilSpeed),
  };
}
/** The first ten level thresholds cost 5 XP; each next block of ten costs 5 more. */
export function balancedXpRequired(level:number):number{return 5*(1+Math.floor((Math.max(1,Math.min(125,level))-1)/10));}
/** Equal kill share through PREVIOUS waves. Fresh selected-wave starts have no banked score or XP. */
export function balancedStartLevel(wave:number,devils=true,players=2):number{
  let experience=0;
  for(let w=1;w<Math.max(1,Math.min(100,Math.floor(wave)));w++){
    const enemies=balancedWave(w,0);
    experience+=enemies.Zombie_TotalCount+(devils?enemies.Devil_TotalCount*5:0);
  }
  experience=Math.floor(experience/Math.max(1,players));
  let level=1;
  while(level<125&&experience>=balancedXpRequired(level)){experience-=balancedXpRequired(level);level++;}
  return level;
}
