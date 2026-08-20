# NEXTRI — Auditoría 002

**Fecha:** 2026-08-19  
**Versión/commit auditado:** v2.88 — `6e2dc7c7157c5fec473ef41f49ac89bbb88924eb`  
**Objetivo:** comprobar el cierre real de Fase 1, revisar lo incorporado desde la auditoría 001 y fijar el siguiente paso.

## Resumen

La Fase 1 está prácticamente cerrada. Desde v2.83 se han corregido los principales hallazgos de la auditoría 001:

- identidad estable del rival;
- reanudación async de estadísticas;
- catálogo dinámico de bots;
- overlays generalizados;
- i18n local con ES/EN/FR;
- panel de control preparado para crecer.

La base está mejor preparada para la nueva interfaz BOT / LOCAL / SALAS y para Supabase.

La principal deuda funcional detectada en esta revisión está en el sistema de Invitado semanal: el desbloqueo actual se calcula a partir de victorias históricas acumuladas. Eso significa que **no es un desbloqueo semanal real** y que, además, borrar estadísticas puede volver a bloquear al invitado. Debe separarse la progresión de la estadística antes de usarla como mecánica estable o sincronizarla con Supabase.

---

## 1. Verificado como resuelto desde Auditoría 001

### P1 — Identidad estable del rival: RESUELTO

Desde v2.85 el jugador IA conserva `opponentId` y `opponentKind`; ya no se deduce la identidad desde el nombre visible.

Esto prepara correctamente:

- invitados;
- Random;
- Phantom;
- Chaos;
- estadísticas por rival;
- guardado/reanudación;
- revancha.

### P1 — Carrera async al reanudar estadísticas: RESUELTO

`resumeGame()` fue convertido a async y espera la restauración estadística.

### P1 — Catálogo dinámico de rivales: RESUELTO

Desde v2.86 las tarjetas nacen desde datos y no desde cuatro bloques HTML escritos a mano.

Esto elimina un bloqueo importante para la nueva UI.

### P1 — Overlays accesibles: RESUELTO

Desde v2.87 Escape y focus trap se aplican al diálogo realmente abierto, no a una lista manual de overlays.

### P2 — i18n base: IMPLEMENTADO ANTES DE LO PREVISTO

Existe infraestructura local con:

- `t()`;
- `setLocale()`;
- `getLocale()`;
- `traducirDocumento()`;
- español;
- inglés;
- francés;
- fallback a español;
- prueba CI de consistencia de claves y placeholders.

Esto encaja con la dirección acordada: traducción base local y, más adelante, overrides/contenido remoto desde Supabase.

Todavía quedan textos de estadísticas, final de partida y avisos por migrar a claves i18n.

---

## 2. Nuevo hallazgo P1 — Invitado semanal no tiene progreso semanal real

El módulo actual define requisitos:

```text
Delta   3 victorias
Circuit 2 victorias
Vector  1 victoria
```

pero recibe un agregado de victorias históricas.

Consecuencias:

1. Una vez cumplidos los requisitos históricos, el invitado queda esencialmente desbloqueado todas las semanas.
2. No existe `weekId`/`eventId` asociado al progreso.
3. El progreso no puede reiniciarse limpiamente al cambiar el invitado.
4. El progreso depende del historial de `games`.
5. `borrarTodo()` borra `games`, por lo que borrar estadísticas puede eliminar de facto el progreso de desbloqueo.
6. No existe todavía una entidad clara que después pueda sincronizarse a Supabase.

### Recomendación

Separar:

```text
estadísticas
```

de:

```text
progresión
```

Persistir algo equivalente a:

```js
{
  eventId: "2026-W34",
  guestId: "atlas",
  wins: {
    delta: 2,
    circuit: 1,
    vector: 0
  },
  points: 4,
  unlocked: false,
  unlockedAt: null
}
```

La mecánica concreta todavía puede cambiar de 3/2/1 a un sistema de puntos. La persistencia no debe depender de esa fórmula.

Se incluye en este paquete un módulo propuesto y aislado para que Claude pueda integrarlo o adaptarlo.

---

## 3. Hallazgo P2 — ROADMAP sigue muy atrasado

`ROADMAP.md` todavía declara “Estado a v2.66”.

También mantiene decisiones ya superadas:

- OAuth después de salas;
- apps necesariamente después de online;
- estadísticas en “ideas sin fecha” aunque ya existen;
- no refleja invitados;
- no refleja i18n;
- no refleja ranking beta;
- no refleja Supabase como siguiente integración;
- no refleja BOT / LOCAL / SALAS;
- no refleja Random, Phantom o Chaos/Savage.

Debe actualizarse antes de seguir acumulando decisiones fuera del repositorio.

---

## 4. Hallazgo P2 — IA sigue siendo v1 y el comentario ya promete “personalidades”

`AI_VERSION` sigue correctamente en `1`.

La implementación sigue siendo una escalera easy/medium/hard basada en cinco parámetros.

Eso es coherente mientras no se llame IA 2.0.

Pero el comentario de `levels.js` ya afirma que Delta/Circuit/Vector “no son niveles de dificultad sino personalidades”, cuando técnicamente todavía son principalmente tres niveles de racionalidad limitada.

No es un bug funcional, pero conviene evitar que la documentación vaya por delante del código.

La IA 2.0 debe introducir perfiles realmente expresivos y no monotónicos.

---

## 5. Invitados: infraestructura útil, personalidad todavía provisional

Hay diez invitados y rotación determinista por semana.

Eso es una buena infraestructura de producto, pero los invitados siguen mapeando a `easy`, `medium` o `hard`.

Por tanto:

- el catálogo puede quedarse;
- nombres/arte/temporadas pueden quedarse;
- sus “personalidades” deben considerarse provisionales hasta IA 2.0.

No crear motores distintos por invitado.

---

## 6. i18n — siguiente pequeño cierre recomendado

Antes de Supabase:

1. migrar estadísticas;
2. migrar modal de fin de partida;
3. migrar avisos restantes;
4. comprobar textos dinámicos con pluralización/placeholders;
5. evitar nuevas cadenas visibles hardcodeadas.

Después Supabase podrá aportar contenido remoto traducible sin sustituir el fallback local.

---

## 7. Nueva interfaz

La dirección acordada sigue siendo:

```text
BOT | LOCAL | SALAS
```

### BOT
- seleccionada por defecto;
- rival como personaje;
- ficha principal;
- selector/carrusel horizontal;
- avatar/arte;
- radar;
- descripción;
- CTA contextual;
- Invitado, Phantom y otros bloqueados visibles sin saturar.

### LOCAL
Mantener funcionalidad actual y evitar rediseño innecesario.

### SALAS
Visible como “Próximamente” hasta tener backend real.

### Dirección artística
La referencia elegida es:

- robots-mascota premium;
- amigables;
- legibles en móvil;
- silueta y expresión claras;
- un color fuerte por personaje;
- nada militar/hardcore;
- nada excesivamente infantil.

---

## 8. Nuevos personajes/direcciones de producto ya acordados

### Core
- Delta
- Circuit
- Vector

### Especiales
- Random
- Phantom
- Lumina (concepto visual/personaje femenino, función final por decidir)

### Savage
- Chaos

### Invitados
Catálogo semanal/estacional.

### Chaos
Chaos debe ser la puerta al futuro modo Savage:

- artefactos;
- fuera de ranking;
- diversión;
- laboratorio antes de Salas Savage.

Primeras reglas candidatas:

```text
sacar 6 en el dado -> artefacto aleatorio
cerrar 4+ triángulos en una tirada -> artefacto extra
```

No implementar todavía en el motor clásico.

---

## 9. Supabase — siguiente integración importante

Tiene sentido introducir Supabase antes de tener dominio propio.

Alcance recomendado de la primera pasada:

- Google Auth;
- `profiles`;
- `games`;
- RLS;
- sincronización IndexedDB -> Supabase;
- ranking beta;
- progresión;
- configuración remota;
- preparación de contenido/traducciones remotas.

No sustituir IndexedDB.

No mover a Supabase:

- reglas;
- `checkMoveValidity()`;
- RNG;
- `chooseAIMove()`;
- motor.

Sí puede vivir remotamente:

- catálogo/config de bots;
- eventos semanales;
- parámetros versionados;
- feature flags;
- contenido editorial;
- traducciones remotas;
- perfiles/estadísticas/ranking/progreso.

---

## 10. AGENTS.md

Añadir `AGENTS.md` en raíz antes de que varios agentes de IA trabajen alternativamente sobre NEXTRI.

Debe recoger las reglas que no queremos volver a explicar a Claude/Cursor/ChatGPT en cada sesión.

Este paquete incluye una propuesta lista para revisar.

---

## 11. Prioridades recomendadas desde v2.88

### P1
1. Separar progreso semanal de estadísticas.
2. Actualizar ROADMAP.
3. Añadir AGENTS.md.

### P2
4. Terminar migración i18n de cadenas visibles.
5. Diseñar nueva interfaz BOT / LOCAL / SALAS.
6. Preparar Supabase foundation.

### P3
7. IA 2.0.
8. Random.
9. Phantom.
10. Chaos/Savage.
11. Salas.

---

## 12. Qué NO tocar ahora

- reglas;
- geometría;
- generador v2;
- `MAX_DIST`;
- scoring;
- dado;
- Undo;
- replay;
- RNG salvo trabajo específico futuro de aislamiento por partida;
- IA v1 durante la fase de infraestructura.

---

## 13. Conclusión

v2.88 está claramente mejor preparada que v2.83. Los P1 originales más importantes están cerrados.

El siguiente error a evitar es construir Supabase, ranking, invitados y nueva UI sobre una progresión semanal que todavía depende de estadísticas históricas.

La secuencia recomendada queda:

```text
cerrar progresión semanal
-> AGENTS.md + ROADMAP
-> completar i18n
-> BOT / LOCAL / SALAS
-> Supabase foundation
-> IA 2.0
-> Random / Phantom / Chaos / invitados avanzados
```
