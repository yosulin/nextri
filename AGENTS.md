# AGENTS.md — NEXTRI

Este archivo contiene reglas de trabajo para cualquier agente de IA o persona que modifique NEXTRI.

## 1. Antes de tocar código

1. Leer el `ROADMAP.md`.
2. Leer la auditoría más reciente en `docs/auditorias/`.
3. Revisar el `main` actual; no asumir que un hallazgo antiguo sigue existiendo.
4. Mantener los cambios pequeños, verificables y reversibles.
5. Ejecutar los tests relacionados con el cambio.

## 2. Reglas del juego: fuente de verdad

No alterar reglas para facilitar UI, IA, estadísticas o backend.

La legalidad exacta debe pasar por `checkMoveValidity()`.

Preservar:

- adyacencia;
- `MAX_DIST` como concepto del motor;
- prohibición de cruces;
- no atravesar círculos;
- bloqueo por triángulos cerrados;
- prohibición de atrapar círculos;
- scoring;
- dado;
- turnos;
- Undo;
- replay.

No crear una versión “aproximada” de las reglas para IA o servidor.

## 3. Motor e IA

Debe existir un único motor de decisión de IA.

No crear:

```text
chooseDeltaMove()
chooseCircuitMove()
chooseVectorMove()
chooseVampirMove()
```

La dirección es:

```text
chooseAIMove(state, profile)
```

Reglas:

- IA determinista para una misma seed/estado/configuración;
- presupuestos por candidatos/nodos/profundidad, no por tiempo;
- `performance.now()` solo para medir;
- no rubber-banding por diferencia de puntuación;
- no trampas;
- no saltarse `checkMoveValidity()`.

`AI_VERSION` solo debe incrementarse cuando cambie el comportamiento real de IA.

## 4. Identidad de rivales

La identidad es un ID estable, nunca el nombre visible.

Usar conceptos equivalentes a:

```text
opponentId
opponentKind
aiProfileId
guestEventId
```

No deducir identidad desde:

- nombre;
- apodo;
- color;
- dificultad.

Guardar y restaurar la identidad en partidas, estadísticas y reanudación.

## 5. Familias de rivales

Dirección de producto:

### Core
- Delta
- Circuit
- Vector

### Especiales/personales
- Random
- Phantom
- Lumina (concepto en evolución)

### Savage
- Chaos

### Invitados
- catálogo semanal/estacional

No asumir que todos los bots son una escala easy < medium < hard.

## 6. Radar

El radar debe describir **cómo juega** un rival, no solo su fuerza.

La dirección prevista es similar a:

- Ataque
- Visión
- Construcción
- Defensa
- Riesgo

No imponer Delta < Circuit < Vector en todos los ejes una vez llegue IA 2.0.

El radar debe derivarse de parámetros reales, no de números decorativos hardcodeados.

## 7. Estado y RNG

El estado debe seguir siendo serializable.

El RNG debe seguir siendo determinista.

No introducir `Math.random()` en lógica de juego reproducible.

A futuro, cada partida/sala debe tener su propio RNG; no diseñar nuevas funciones que dependan de un singleton global si van a necesitar ejecución multisalón.

## 8. Estadísticas y progresión

No mezclar:

```text
estadísticas
```

con:

```text
progresión/desbloqueos/entitlements
```

“Borrar estadísticas” no debe borrar:

- progreso semanal;
- desbloqueos;
- compras;
- entitlements;
- progreso de Phantom.

Los modos deben distinguirse explícitamente:

```text
solo
local
online
```

Y los rulesets futuros:

```text
classic
savage
```

Partidas Savage no afectan al ranking competitivo.

## 9. Offline primero

NEXTRI debe seguir funcionando sin conexión para el juego local/contra bots principales.

No sustituir IndexedDB por Supabase.

Dirección:

```text
cliente local
+ sincronización remota opcional
```

Los fallos de red no deben impedir abrir y jugar una partida local.

## 10. Supabase

Supabase se usará para:

- Auth;
- perfiles;
- sincronización;
- estadísticas remotas;
- rankings;
- progreso;
- eventos;
- catálogo/config remota;
- contenido/traducciones;
- salas/Reatime más adelante.

No usar Supabase como sustituto del motor.

No descargar código de IA arbitrario desde base de datos.

Una partida debe congelar la configuración con la que empezó.

Nunca exponer `service_role`/secretos en cliente.

Diseñar RLS desde el inicio.

## 11. i18n

No añadir nuevas cadenas visibles hardcodeadas si pueden pasar por el sistema i18n.

Mantener traducciones base locales.

La app debe poder arrancar y ser usable sin descargar traducciones.

Supabase podrá aportar overrides/contenido remoto más adelante.

Mantener paridad de claves y placeholders entre idiomas.

## 12. UI

Dirección principal:

```text
BOT | LOCAL | SALAS
```

- BOT por defecto.
- LOCAL conserva la experiencia funcional actual salvo mejoras justificadas.
- SALAS permanece “Próximamente” hasta tener implementación real.

Los bots deben renderizarse desde datos/catálogo, no con HTML duplicado por personaje.

Priorizar legibilidad y scroll sano antes que encoger tipografía para que “todo quepa”.

## 13. Dirección artística de bots

Los rivales son personajes-mascota premium para público general:

- legibles en móvil;
- silueta clara;
- expresión simple;
- color propio;
- amigables;
- modernos;
- no sci-fi militar/hardcore;
- no excesivamente infantiles.

Cada bot debe reconocerse rápidamente incluso en avatar pequeño.

## 14. Chaos / Savage

Chaos es un modo de diversión, no competitivo.

Savage:

- artefactos;
- fuera de ranking;
- reglas separadas del clásico;
- primero se prueba contra Chaos;
- solo después llega a Salas Savage.

No vender consumibles que otorguen ventaja en partidas competitivas.

## 15. Rendimiento y dependencias

Evitar frameworks/librerías nuevas sin necesidad real.

Preferir:

- JS nativo;
- módulos pequeños;
- funciones puras;
- CSS/HTML simple;
- SVG propio;
- tests.

No añadir librerías de carrusel o gráficos si la funcionalidad actual puede resolverse limpiamente sin ellas.

## 16. Versionado y caché

Cuando se cambia versión de app:

- actualizar la fuente de versión correspondiente;
- revisar service worker/cache busting;
- evitar mezclar módulos de versiones distintas.

No incrementar versiones por cambios que no lo requieran si el proyecto tiene una convención concreta; seguir la convención existente.

## 17. Tests mínimos para cambios sensibles

Según aplique, proteger:

- save/resume;
- revancha;
- identidad de rival;
- RNG;
- reglas;
- i18n;
- progreso;
- radar;
- catálogo;
- responsive;
- overlays;
- PWA.

No borrar tests para hacer pasar CI.

## 18. Forma de trabajar

Si una auditoría antigua dice que algo está roto:

**verificar primero.**

Si ya fue corregido:

**no “arreglarlo” otra vez.**

Si una decisión de producto todavía está abierta:

**no convertirla en arquitectura irreversible sin confirmación.**
