# Hoja de ruta de NEXTRI

Estado a v2.91. Lo marcado como hecho está verificado con pruebas en CI
(motor, estado, guardado, RNG, estadísticas, radar, generación de tableros,
traducciones, progreso semanal, y una prueba que carga la app real en un
navegador y juega una partida).

## Hecho

- Juego local de 2 a 6 jugadores y modo Solo contra Delta, Circuit y Vector.
- Motor puro `applyAction(state, action)`, sin DOM ni globales, con IDs
  estables de jugador e identidad persistida del rival.
- Estado serializable, guardar y reanudar, registro de eventos y replay.
- Generador de números aleatorios determinista con flujos separados.
- Generador de tableros v2: varios candidatos y se elige el de mejor calidad.
- PWA instalable y sin conexión, con rutas relativas.
- Estadísticas locales en IndexedDB, sin backend y sin guardar nombres.
- Progreso semanal del invitado, **separado** de las estadísticas.
- Identidad de marca, radar de perfil, carrusel de rivales.
- i18n local con español, inglés y francés.

## Siguiente

1. **Terminar i18n**: quedan estadísticas, fin de partida y avisos por
   traducir. Se hace antes de la nueva interfaz para no traducir dos veces.
2. **Nueva interfaz BOT / LOCAL / SALAS**. Salas visible como
   "Próximamente", sin backend fingido.
3. **Supabase, primera pasada**: acceso con Google, perfiles, sincronización
   de estadísticas y evento semanal. Empezando por invitados, no por OAuth
   obligatorio: un juego que se comparte por enlace no puede recibir a nadie
   con un muro de acceso.
4. **IA 2.0**. Requisitos de entrada: generador aleatorio por partida (hoy
   es único del módulo, y un servidor con varias salas las haría compartir
   secuencia) y una línea base de partidas jugadas con la IA actual, para
   poder comparar `AI_VERSION` 1 contra 2.
5. **Calibración** de Delta, Circuit y Vector con datos reales.
6. **Random, Phantom y Chaos**, una vez calibrada la IA 2.0.
7. **Beta con usuarios**, repositorio privado y `playnextri.com`.
8. **Capacitor para Android**, y iOS cuando haya Mac. La lógica se mantiene
   compartida; nada crítico exclusivo de una plataforma.
9. **Salas online**: invitados, código de sala, dos jugadores remotos,
   servidor autoritativo.

## Decisiones tomadas

- Los rivales son **personalidades**, no niveles de dificultad — aunque hoy
  técnicamente aún sean tres niveles de racionalidad limitada. Un solo
  `chooseAIMove()` parametrizado, nunca un motor por rival.
- **Nada de ajustar la IA según el marcador**: ni ayudar al que pierde ni
  frenar al que gana.
- El invitado se desbloquea **cada semana**, y su progreso no depende del
  historial de partidas.
- Supabase decide *qué* invitado está activo, nunca *cómo* juega: su código
  y su arte viajan en la app, para que funcione sin conexión.
- El repositorio pasará a privado antes de la beta seria.

## Fuera de alcance por ahora

Modo Savage con artefactos (Chaos es su puerta de entrada), ranking,
amigos e invitaciones, modo asíncrono por turnos.
