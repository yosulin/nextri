// src/ai/invitados.js
//
// El rival invitado: una cuarta tarjeta que cambia cada semana y que hay
// que desbloquear ganando a los tres fijos.
//
// AVISO HONESTO sobre las personalidades: con los cinco parámetros que
// hoy tiene la IA (ataque, visión, construcción, defensa, ambición) no da
// para diez caracteres realmente distintos — algunos se sienten parecidos
// entre sí. Los perfiles están definidos y la infraestructura funciona;
// cuando la IA 2.0 añada ejes de comportamiento (zona del tablero, si
// persigue al rival, ritmo), estos perfiles se afinarán y ahí sí se
// notará cada uno como un personaje propio.
//
// La rotación NO necesita servidor: la semana del año determina cuál
// toca, así que todos los dispositivos coinciden sin sincronizar nada.

// Número de semana ISO: es lo que hace que la rotación sea igual para
// todo el mundo sin preguntar a ningún servidor.
export function semanaDelAño(fecha = new Date()) {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicioAño = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - inicioAño) / 86400000) + 1) / 7);
}

// Invitados fijados a una semana concreta por su temática. El resto de
// semanas se reparten entre los demás por rotación.
export const INVITADOS_POR_FECHA = {
  44: 'vampir',   // finales de octubre — Halloween
  52: 'rudolf',   // Navidad
  1:  'nova'      // Año nuevo
};

export const INVITADOS = {
  vampir: {
    nombre: 'Vampir', apodo: 'Nocturno', color: '#b3324a', nivel: 'hard',
    descripcion: 'Espera en la sombra y ataca cuando te confías.',
    tema: 'Halloween'
  },
  rudolf: {
    nombre: 'Rudolf', apodo: 'Repartidor', color: '#c0392b', nivel: 'medium',
    descripcion: 'Va rápido y no se entretiene: cierra lo que encuentra.',
    tema: 'Navidad'
  },
  nova: {
    nombre: 'Nova', apodo: 'Estrella', color: '#e0b020', nivel: 'hard',
    descripcion: 'Empieza tranquila y termina brillando.',
    tema: 'Año nuevo'
  },
  quantum: {
    nombre: 'Quantum', apodo: 'Impredecible', color: '#00a99d', nivel: 'medium',
    descripcion: 'Nunca sabes por dónde va a salir.'
  },
  atlas: {
    nombre: 'Atlas', apodo: 'Paciente', color: '#7f8c8d', nivel: 'hard',
    descripcion: 'No tiene prisa. Construye y espera su momento.'
  },
  chispa: {
    nombre: 'Chispa', apodo: 'Impulsiva', color: '#ff6b35', nivel: 'easy',
    descripcion: 'Ataca todo lo que ve, sin pensarlo dos veces.'
  },
  orion: {
    nombre: 'Orión', apodo: 'Cartógrafo', color: '#3d5af1', nivel: 'hard',
    descripcion: 'Lee el tablero entero antes de mover una línea.'
  },
  brisa: {
    nombre: 'Brisa', apodo: 'Ligera', color: '#4dd0a7', nivel: 'easy',
    descripcion: 'Juega suelta y sin agobios. Buen rival para descansar.'
  },
  golem: {
    nombre: 'Gólem', apodo: 'Muralla', color: '#8d6e63', nivel: 'medium',
    descripcion: 'No te regala nada. Tendrás que abrirte paso.'
  },
  eco: {
    nombre: 'Eco', apodo: 'Reflejo', color: '#9b59b6', nivel: 'medium',
    descripcion: 'Aprende de lo que haces y te lo devuelve.'
  }
};

// Cuántas victorias hacen falta contra cada rival fijo. Ganar a Vector es
// mucho más difícil que ganar a Delta, así que cuenta más: con una sola
// victoria ante Vector ya se lleva media puerta.
export const REQUISITOS_DESBLOQUEO = {
  delta: 3,
  circuit: 2,
  vector: 1
};

// Progreso de 0 a 1. Cada rival aporta su parte, y se cuenta como
// completo aunque se supere el objetivo (ganar 10 veces a Delta no
// desbloquea por sí solo: hay que enfrentarse a los tres).
export function progresoDesbloqueo(victoriasPorRival = {}) {
  const partes = Object.entries(REQUISITOS_DESBLOQUEO).map(([rival, requeridas]) => {
    const conseguidas = victoriasPorRival[rival] || 0;
    return Math.min(1, conseguidas / requeridas);
  });
  return partes.reduce((s, x) => s + x, 0) / partes.length;
}

export function estaDesbloqueado(victoriasPorRival = {}) {
  return progresoDesbloqueo(victoriasPorRival) >= 1;
}

// Qué falta exactamente, para poder decírselo al jugador en vez de
// dejarle adivinar.
export function loQueFalta(victoriasPorRival = {}) {
  return Object.entries(REQUISITOS_DESBLOQUEO)
    .map(([rival, requeridas]) => ({
      rival,
      faltan: Math.max(0, requeridas - (victoriasPorRival[rival] || 0))
    }))
    .filter(x => x.faltan > 0);
}

// El invitado de esta semana. Si la semana tiene uno temático asignado,
// ese; si no, rotación entre los que no están reservados para una fecha.
export function invitadoDeLaSemana(fecha = new Date()) {
  const semana = semanaDelAño(fecha);
  const fijado = INVITADOS_POR_FECHA[semana];
  if (fijado && INVITADOS[fijado]) return { id: fijado, ...INVITADOS[fijado] };

  const reservados = new Set(Object.values(INVITADOS_POR_FECHA));
  const rotativos = Object.keys(INVITADOS).filter(id => !reservados.has(id));
  const id = rotativos[semana % rotativos.length];
  return { id, ...INVITADOS[id] };
}
