# NEXTRI — Auditoría 001

**Fecha:** 2026-08-19  
**Base auditada:** NEXTRI v2.83  
**Commit de referencia:** `80a5e28d024eb572985d352624592c56a5d2b7c1`  
**Estado:** Auditoría técnica + dirección de producto

## 1. Resumen ejecutivo

NEXTRI está evolucionando desde un juego local con tres niveles de IA hacia un producto con rivales con identidad, perfiles de IA diferenciados, bots especiales, invitados semanales, Random, Phantom, autenticación, estadísticas remotas, ranking, futuro multijugador, modo Savage con artefactos, preparación Android/iOS e internacionalización.

La base actual es buena: motor separado, reglas centralizadas, RNG determinista, persistencia, estadísticas locales, tests, generador de tableros v2, radar y PWA. La prioridad inmediata debe ser sanear varios puntos de arquitectura antes de seguir añadiendo contenido.

## 2. Estado actual confirmado

### IA

La IA sigue en `AI_VERSION = 1`.

- Delta → fácil
- Circuit → medio
- Vector → difícil

Existe un único `chooseAIMove()` parametrizado por dificultad. La IA enumera jugadas legales con `checkMoveValidity()`, clasifica puntuación/construcción/seguridad, usa RNG determinista y limita candidatos según dificultad.

Todavía no existen fases de partida, búsqueda por profundidad, movilidad, continuación, presupuesto de nodos, perfiles no monotónicos, Random, Phantom, Invitados ni Chaos/Savage.

**Conclusión:** la próxima evolución debe ser hacia perfiles de personalidad, no simples niveles de dificultad.

## 3. Hallazgos de auditoría

### P1 — Identidad del rival no persistida correctamente

El guardado conserva `aiDifficulty`, pero no una identidad estable como `aiOpponentId`. Esto puede producir incoherencias en guardar/reanudar/revancha y será un bloqueo claro al introducir nuevos bots.

**Recomendación:** persistir una identidad estable y usarla como fuente de verdad:

```text
opponentId
opponentKind
aiProfileId
guestEventId
```

Nunca inferir identidad desde nombre visible, color o dificultad.

### P1 — La UI de rivales no escala

Delta, Circuit y Vector siguen teniendo markup explícito en HTML. Añadir Random, Phantom, Chaos o invitados obligaría a seguir tocando HTML.

**Recomendación:** catálogo de bots basado en datos y render dinámico.

### P1 — Accesibilidad de overlays incompleta

La lógica de teclado/focus trap no está generalizada para todos los overlays.

**Recomendación:** sistema común para Escape, focus trap, foco inicial y restauración de foco.

### P1 — Carrera potencial al reanudar estadísticas

`Stats.reanudarPartida()` es asíncrona y la UI puede continuar antes de que estadísticas haya terminado de restaurar su estado.

**Recomendación:** esperar explícitamente la restauración antes de aceptar acciones dependientes de estadísticas.

## 4. Hallazgos P2

### Estadísticas demasiado centradas en Solo

El modelo usa conceptos como `humanScore`, `aiScore`, `human-win` y `ai-win`. Sirve para Solo pero no generaliza bien a Local 2–6 y futuro Online.

**Recomendación:** empezar a distinguir `mode: solo | local | online` y preparar un modelo general de jugadores/resultados sin romper agregados actuales.

### Agregados de rivales centrados en Core

La lógica actual asume Delta/Circuit/Vector. Debe prepararse para:

```text
core
personal
savage
guest
```

### Radar entendido como dificultad

Los tests actuales fuerzan aproximadamente `Delta < Circuit < Vector` en todos los ejes.

Eso debe cambiar. El radar debe describir **cómo juega** el rival, no cuánto de fuerte es.

Ejes recomendados:

- Ataque
- Visión
- Construcción
- Defensa
- Riesgo

### ROADMAP desactualizado

Debe reflejar la nueva dirección: saneamiento, bots/UI, i18n, Supabase, IA 2.0, calibración, Random/Phantom/Invitados, beta, Android, Salas y Savage.

## 5. Generador de tablero

El generador v2 se considera correcto y mejorado. Ya dispone de `BOARD_GENERATOR_VERSION = 2`, score de calidad, distribución, cobertura, penalización de hubs/ángulos y múltiples candidatos.

**No tocarlo salvo bug real o evidencia estadística nueva.**

No modificar el `MAX_DIST` de gameplay solamente para mejorar estética, porque cambiaría balance y reglas.

## 6. Reglas que no deben tocarse

Preservar:

- adyacencia;
- MAX_DIST como concepto;
- prohibición de cruces;
- no atravesar círculos;
- bloqueo por triángulos cerrados;
- prohibición de atrapar círculos;
- scoring actual;
- dado;
- turnos;
- Undo;
- legalidad exacta;
- `checkMoveValidity()` como fuente de verdad.

## 7. Nueva dirección de interfaz

La portada debe evolucionar hacia:

```text
BOT | LOCAL | SALAS
```

### BOT

Seleccionado por defecto. Debe usar una ficha principal + selector/carrusel horizontal, con avatar, nombre, apodo, descripción, radar, estado de bloqueo y CTA.

### LOCAL

Mantener prácticamente como está.

### SALAS

Visible pero con `PRÓXIMAMENTE`, sin backend ficticio ni controles muertos.

## 8. Familias de bots

### Core

- Delta — enseña NEXTRI
- Circuit — crea revancha
- Vector — crea reto

### Personal / Especiales

- Random
- Phantom
- Chaos

### Invitados / Seasonal

Ejemplos:

- Vampir — Depredador
- Rudolf — Constructor
- Yeti — Guardián
- Cupid — Apostador
- Sol

## 9. IA 2.0

Mantener **un único motor**:

```text
chooseAIMove(state, profile)
```

No crear `chooseVampirMove()`, `chooseChaosMove()`, etc.

### Fases

```js
remainingRatio = legalMoves.length / st.candidatePairs.length
```

```text
opening  > 0.65
middle   0.30–0.65
endgame <= 0.30
```

### Evaluación conceptual

```text
moveScore =
    immediateTriangles * scoreWeight
  + ownFutureReplies * setupWeight
  - opponentScoringReplies * giftPenalty
  + futureMobility * mobilityWeight
  + safeContinuations * continuationWeight
```

### Determinismo

Usar presupuestos deterministas:

```text
candidateLimit
searchDepth
maxSearchNodes
```

No usar tiempo de CPU como criterio de decisión.

### Rubber-banding

Prohibido adaptar la IA a la diferencia de puntuación.

## 10. Objetivos de calibración

Objetivos de playtesting, no asserts de CI:

```text
Delta    65–80% victoria humana
Circuit  35–50%
Vector    5–15%
```

## 11. Random

Random no debe escoger entre Delta/Circuit/Vector al azar. Debe generar un perfil distinto por partida dentro de límites sanos.

Misma seed ⇒ mismo perfil.

UX prevista: radar oculto antes de jugar y revelado al terminar, junto a un descriptor de personalidad.

## 12. Phantom

Phantom debe aprender tendencias tácticas del jugador, no su simple win rate.

Medir decisiones como:

- si había puntuación y la tomó;
- si eligió la mejor puntuación disponible;
- construcción;
- seguridad;
- riesgo;
- movilidad;
- regalos al rival.

Criterio de aparición: mínimo de partidas + mínimo de decisiones analizables. Ejemplo inicial no cerrado: 20 partidas + 300 decisiones útiles.

## 13. Invitados semanales

Debe existir un invitado de la semana, usando catálogo rotativo de aproximadamente 8–12 bots.

Desbloqueo semanal preliminar:

```text
Ganar Delta   +1
Ganar Circuit +2
Ganar Vector  +3
```

Con límites por rival para evitar farm. Objetivo: desbloqueo razonable en unas 4–8 partidas, sin grind.

## 14. Progresión separada de estadísticas

`Borrar estadísticas` no debe borrar:

- desbloqueos;
- progreso semanal;
- compras/entitlements;
- progreso Phantom.

Crear una capa de progreso independiente y sincronizable con Supabase.

## 15. Supabase — siguiente gran integración

Supabase puede integrarse antes de tener `playnextri.com`.

Primera integración prevista:

- Google Auth;
- profiles;
- games;
- IndexedDB sync;
- RLS;
- ranking beta;
- progreso;
- configuración remota.

Arquitectura:

```text
Juego
  |
  +-- IndexedDB
  |
  +-- Sync Supabase
```

IndexedDB no se sustituye.

## 16. Qué guardar en Supabase

### Identidad

`profiles`

### Datos de juego

`games`, `progress`, estadísticas derivadas.

### Configuración

`bots`, `ai_profiles`, `guest_events`, `app_config`.

### Futuro

`rankings`, `rooms`, `entitlements`, datos de eventos.

## 17. Qué NO debe depender de Supabase

Mantener local/versionado:

- reglas;
- `checkMoveValidity()`;
- motor;
- RNG;
- `chooseAIMove()`;
- búsqueda;
- scoring.

Supabase puede suministrar configuración, pero una partida debe congelar la configuración utilizada.

Ejemplo:

```text
opponentId: vampir
aiVersion: 2
aiConfigVersion: 17
```

Debe existir fallback local para offline.

## 18. Internacionalización

Introducir i18n antes de que siga creciendo la UI.

Propuesta:

```text
src/i18n/
  i18n.js
  locales/
    es.json
    en.json
```

API mínima:

```js
t(key, params)
setLocale(locale)
getLocale()
```

Modelo híbrido:

```text
traducciones base locales
+
overrides remotos Supabase
```

Así funciona offline y permite contenido/eventos multilenguaje.

## 19. Ranking

Puede comenzar como `Ranking Beta` basado en resultados Solo.

No debe presentarse todavía como ranking competitivo totalmente fiable porque el cliente controla las partidas Solo.

El ranking serio debe llegar con resultados verificados/servidor autoritativo.

## 20. CHAOS / SAVAGE

Nueva dirección aceptada:

```text
CHAOS
Modo Savage
Sin ranking
Solo diversión
```

Chaos es la puerta de entrada al sistema de artefactos y el laboratorio antes de llevar Savage a Salas.

Su función de producto:

```text
CHAOS desordena
```

## 21. Artefactos Savage

Primera idea de reglas:

```text
Dado = 6
=> artefacto aleatorio
```

```text
Cerrar 4+ triángulos en una tirada
=> artefacto extra
```

El umbral debe calibrarse con telemetría.

Principios:

- inventario pequeño;
- artefactos simples;
- máximo uso por tirada;
- siempre fuera de ranking;
- obtenidos jugando;
- no pay-to-win.

MVP sugerido:

- Bomba
- Escudo
- Pulso

## 22. Salas futuras

Dos reglas previstas:

```text
SALAS CLÁSICO
SALAS SAVAGE
```

### Clásico

Reglas normales y potencialmente ranked.

### Savage

Artefactos, caos y amigos. Sin ranking.

Antes de implementar Salas Savage:

```text
Chaos
=> telemetría
=> balance
=> reglas estables
=> Salas Savage
```

## 23. Monetización — dirección preliminar

Evitar vender ventaja competitiva o consumibles tipo "5 bombas".

Preferir:

- invitados permanentes;
- acceso directo;
- cosméticos;
- efectos;
- packs visuales;
- contenido/modos.

Principio:

> El dinero puede desbloquear contenido o ahorrar tiempo, pero no debe comprar victorias.

Usar a futuro un sistema genérico de `entitlements` separado de estadísticas.

## 24. Android / iOS

Dirección:

```text
Web
 |
Capacitor
 |-- Android
 `-- iOS futuro
```

No introducir lógica crítica exclusiva de Android.

Funciones nativas detrás de una capa tipo:

```js
Platform.haptics()
Platform.share()
Platform.openUrl()
Platform.notifications()
```

## 25. Arquitectura objetivo de bots

```text
CORE
  delta
  circuit
  vector

PERSONAL
  random
  phantom

SAVAGE
  chaos

GUEST
  vampir
  rudolf
  yeti
  cupid
```

Perfiles:

```text
AI_PROFILES
  delta
  circuit
  vector
  random-generated
  phantom-derived
  chaos
  predator
  builder
  guardian
```

Un único motor:

```text
chooseAIMove(state, profile)
```

## 26. Orden recomendado

### Fase 1 — Saneamiento

1. Persistir `aiOpponentId`.
2. Corregir revancha/reanudación.
3. Corregir carrera async de Stats.
4. Generalizar overlays.
5. Convertir bots a catálogo dinámico.
6. Añadir tests.
7. Mantener `AI_VERSION = 1`.

**STOP y nueva auditoría.**

### Entre Fase 1 y Fase 2

Introducir i18n mínimo: `t()`, español, inglés, fallback y locale persistido.

### Fase 2 — Nueva UI

Implementar `BOT | LOCAL | SALAS`.

BOT: selector/carrusel + ficha + radar + descripción + CTA.  
LOCAL: conservar.  
SALAS: Próximamente.

### Entre Fase 2 y Fase 3

Supabase Foundation:

- Google Auth;
- profiles;
- games;
- RLS;
- IndexedDB sync;
- ranking beta;
- progreso;
- config;
- traducciones remotas.

### Fase 3 — IA 2.0

- `AI_VERSION = 2`;
- fases;
- movilidad;
- continuación;
- búsqueda;
- perfiles;
- presupuesto de nodos;
- radar semántico.

Calibrar primero Delta, Circuit y Vector.

### Fase 4 — Expansión de bots

Random, Phantom, Invitados y Chaos/Savage.

### Fase 5 — Beta

Usuarios reales y telemetría de abandono, rematch, dificultad, duración, ranking, desbloqueo y Savage.

### Fase 6 — Android

Capacitor + beta.

### Fase 7 — Salas

Primero Clásico. Después Savage.

## 27. Tests prioritarios

Añadir conforme existan las funciones:

```text
rival exacto sobrevive save/resume
revancha conserva rival
botId no depende del nombre visible
UI bots nace desde catálogo
overlay escape/focus
stats resume correctamente
opponentKind correcto
guest progress separado de stats
borrar stats no borra progreso
radar refleja perfil real
Random determinista por seed
Phantom profile derivation pura
weekly rollover
Chaos marcado no-ranked
```

## 28. Cosas que NO hacer

- No crear un motor de IA por bot.
- No reescribir el generador v2 sin evidencia.
- No cambiar reglas para facilitar IA.
- No usar tiempo de CPU como presupuesto de búsqueda.
- No hacer rubber-banding por score.
- No reemplazar IndexedDB por Supabase.
- No hacer que el juego necesite internet.
- No convertir la portada en tienda de personajes.
- No implementar Auth + ranking + realtime + salas simultáneamente.
- No introducir frameworks innecesarios.
- No vender ventaja competitiva.

## 29. Criterio de éxito de producto

NEXTRI debe dejar de sentirse como:

> Fácil / Medio / Difícil

Y empezar a sentirse como:

> Elijo contra quién quiero jugar.

Después:

> Quiero desbloquear al invitado de esta semana.

> Random nunca juega igual.

> Phantom empieza a jugar como yo.

> Contra Chaos vengo a divertirme.

Y finalmente:

> En Salas puedo elegir competir o jugar Savage con amigos.

## 30. Próxima auditoría

Después de terminar Fase 1:

```text
002-auditoria-post-fase-1.md
```

Debe comparar contra esta auditoría y marcar:

- resuelto;
- parcialmente resuelto;
- pendiente;
- nuevo hallazgo;
- regresión.

Mantener numeración incremental:

```text
001
002
003
004
...
```

---

**Fin de Auditoría 001**
