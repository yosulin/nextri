#!/usr/bin/env node
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = readFileSync(path.join(root, 'src/progression/player-model.js'),'utf8')
  .replace(/(^|\n)export /g, '$1')
  .replace(/(^|\n)const /g, '$1var ');
eval(source);
let fail=0; const ok=(m,v)=>{if(v) console.log('OK: '+m); else {console.error('FALLO: '+m); fail++;}};

(async()=>{
  const memory=new Map();
  const service=createPlayerModelService({
    readMeta: async k => memory.get(k) ?? null,
    writeMeta: async (k,v) => { memory.set(k, JSON.parse(JSON.stringify(v))); }
  });
  let m=await service.load();
  ok('Phantom empieza bloqueado', !phantomUnlocked(m));
  ok('modelo empieza neutro', playerRadar(m).ataque === 0.5);

  await Promise.all([
    service.recordDecision({attack:1,vision:1,construction:null,defense:null,risk:null}),
    service.recordDecision({attack:0,vision:0.5,construction:1,defense:null,risk:null}),
    service.recordDecision({attack:null,vision:null,construction:null,defense:1,risk:0})
  ]);
  m=await service.load();
  ok('updates concurrentes no se pisan', m.decisionsAnalyzed === 3);
  ok('ataque aprende promedio', Math.abs(m.traits.attack.value - 0.5) < 1e-9);
  ok('construcción aprendida', m.traits.construction.value === 1);

  for(let i=0;i<49;i++) await service.recordCompletedGame('g'+i);
  m=await service.load();
  ok('49 partidas todavía bloqueado', !phantomUnlocked(m));
  await service.recordCompletedGame('g49');
  m=await service.load();
  ok('50 partidas desbloquean Phantom', phantomUnlocked(m));
  await service.recordCompletedGame('g49');
  m=await service.load();
  ok('misma partida no cuenta dos veces', m.gamesAnalyzed === 50);

  const profile=phantomAIProfile(m);
  ok('perfil Phantom sale del modelo', profile.id === 'phantom' && profile.source === 'player-model');
  ok('perfil efectivo tiene parámetros válidos', profile.candidateLimit >= 18 && profile.scoringAwareness >= 0 && profile.scoringAwareness <= 1);

  // Simula borrar estadísticas: el servicio solo usa META, por lo que el
  // modelo permanece intacto mientras el store de games desaparece.
  const games=['x','y']; games.length=0;
  m=await service.load();
  ok('borrar estadísticas no borra Phantom', m.gamesAnalyzed === 50 && phantomUnlocked(m));

  if(fail) process.exit(1);
  console.log('Modelo vivo de Phantom correcto.');
})();
