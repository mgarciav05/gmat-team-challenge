# GMAT Team Challenge — Guía de instalación (para no programadores)

**Objetivo: tener esto funcionando en 15 minutos, sin escribir código.**

No necesitas saber programar. Todo lo que vas a hacer es: (1) copiar y pegar unos valores en UN solo archivo, (2) arrastrar una carpeta a una página web para publicarla, y (3) abrir un enlace. Esta guía asume que no sabes programar y explica cada paso.

---

## 0. Qué archivos tienes

```
gmat_team_challenge/
├── index.html          <- la app (no se toca)
├── styles.css           <- el diseño (no se toca)
├── app.js                <- la lógica (no se toca)
├── config.js             <- EL ÚNICO ARCHIVO QUE EDITAS
└── lib/                  <- motor interno (no se toca)
```

Solo vas a abrir `config.js` con el Bloc de notas (o cualquier editor de texto) y cambiar algunos valores entre comillas. Nunca necesitas tocar los demás archivos.

---

## 1. Modo DEMO — pruébalo ya, sin internet ni configuración

`config.js` ya viene listo para funcionar en **modo demo**: abre `index.html` haciendo doble clic, y abre varias pestañas del navegador con esa misma página. Cada pestaña actúa como "un estudiante distinto" y todas se sincronizan entre sí automáticamente (usando solo el navegador, sin internet).

Esto te sirve para:
- Construir tu confianza con el flujo completo (registro → equipos → preguntas → leaderboard) antes de la clase.
- Ensayar como facilitador tú sola, abriendo 5-10 pestañas para simular estudiantes.

**Limitación honesta e importante:** el modo demo solo sincroniza pestañas del **mismo navegador en la misma computadora**. Dos celulares distintos NO van a ver el mismo reto en modo demo — cada uno vería su propia copia vacía. Para la clase real, con 10-50 celulares de estudiantes, necesitas el **Modo FIREBASE** (sección 2).

Para acceder al Host Dashboard en cualquier modo: abre `index.html` y haz clic en el enlace pequeño "¿Eres el facilitador? Host login" al final de la pantalla de inicio, o abre la página agregando `?host=1` al final de la dirección. La contraseña por defecto es `fic2026` (la puedes cambiar en `config.js`, ver sección 3).

---

## 2. Modo FIREBASE — para la clase real (celulares de estudiantes)

Firebase es un servicio gratuito de Google que le da a tu app una "base de datos compartida en la nube", para que el celular de cada estudiante y tu laptop vean exactamente lo mismo en tiempo real. El plan gratuito (Spark) es más que suficiente para una clase de 50 personas.

### Paso 1 — Crear el proyecto de Firebase (3 min)

1. Ve a **https://console.firebase.google.com** e inicia sesión con una cuenta de Google (puede ser tu cuenta personal).
2. Haz clic en **"Agregar proyecto" / "Add project"**.
3. Ponle un nombre, por ejemplo `gmat-team-challenge-fic`. Puedes desactivar Google Analytics (no lo necesitas) para ir más rápido.
4. Espera a que se cree (unos 30 segundos) y haz clic en **"Continuar"**.

### Paso 2 — Activar Firestore (la base de datos) (2 min)

1. En el menú de la izquierda, busca **"Compilación" (Build) → "Firestore Database"**.
2. Haz clic en **"Crear base de datos" (Create database)**.
3. Elige **"Modo de producción" (Production mode)** — no te preocupes, en el Paso 4 vamos a pegar las reglas de seguridad correctas.
4. Elige la ubicación del servidor más cercana a ti (por ejemplo `southamerica-east1` o `us-central1`) y confirma.

### Paso 3 — Activar el inicio de sesión anónimo (1 min)

Esto permite que los estudiantes entren SIN crear una cuenta ni escribir un correo — es completamente invisible para ellos.

1. En el menú de la izquierda: **"Compilación" (Build) → "Authentication"**.
2. Haz clic en **"Comenzar" (Get started)**.
3. En la lista de proveedores, haz clic en **"Anónimo" (Anonymous)** y actívalo (toggle a "Habilitado/Enabled"). Guarda.

### Paso 4 — Pegar las reglas de seguridad (2 min)

1. Vuelve a **Firestore Database → pestaña "Reglas" (Rules)**.
2. Borra lo que haya y pega exactamente esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sessionId}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Haz clic en **"Publicar" (Publish)**.

Esta regla dice: "cualquiera que haya iniciado sesión (aunque sea anónimamente) puede leer y escribir dentro de `sessions/`". Es sencilla a propósito — en la sección 6 explico exactamente qué protege y qué no.

### Paso 5 — Crear la "app web" y copiar tu configuración (3 min)

1. Ve al ícono de engranaje (⚙️) junto a "Project Overview" → **"Configuración del proyecto" (Project settings)**.
2. Baja hasta **"Tus apps" (Your apps)** y haz clic en el ícono `</>` (Web).
3. Ponle un apodo, por ejemplo `gtc-web`, y haz clic en **"Registrar app"**. NO necesitas activar Firebase Hosting aquí.
4. Firebase te muestra un bloque de código con algo así:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "gmat-team-challenge-fic.firebaseapp.com",
  projectId: "gmat-team-challenge-fic",
  storageBucket: "gmat-team-challenge-fic.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcabc"
};
```

5. **Copia esos 6 valores.** Los vas a pegar en el paso siguiente.

### Paso 6 — Pegar tu configuración en `config.js`

1. Abre el archivo `config.js` con el Bloc de notas (clic derecho → "Abrir con" → Bloc de notas / TextEdit / cualquier editor de texto simple — NO Word).
2. Cambia esta línea:
   ```js
   const BACKEND_MODE = "demo";
   ```
   por:
   ```js
   const BACKEND_MODE = "firebase";
   ```
3. Reemplaza los 6 valores dentro de `FIREBASE_CONFIG` con los que copiaste en el Paso 5. Debe quedar así (con TUS valores, no los de este ejemplo):
   ```js
   const FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "gmat-team-challenge-fic.firebaseapp.com",
     projectId: "gmat-team-challenge-fic",
     storageBucket: "gmat-team-challenge-fic.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcabc",
   };
   ```
4. Guarda el archivo (Ctrl+S / Cmd+S), sin cambiar el nombre ni la extensión (`config.js`).

¡Listo! Tu app ya está conectada a tu propia base de datos en la nube.

---

## 3. Publicarla en internet (para que el QR funcione en celulares)

Mientras `index.html` esté solo en tu computadora, únicamente TÚ puedes abrirlo. Para que los celulares de los estudiantes puedan entrar, la carpeta completa debe estar publicada en una dirección de internet. La forma más simple y gratuita es **Netlify Drop** (no requiere cuenta ni instalar nada):

1. Ve a **https://app.netlify.com/drop** en tu navegador.
2. Arrastra la carpeta completa `gmat_team_challenge` (la carpeta entera, con `index.html`, `config.js`, `styles.css`, `app.js` y `lib/` adentro) hacia el recuadro de la página.
3. En unos segundos, Netlify te da una dirección pública, algo como:
   `https://curious-lovelace-abc123.netlify.app`
4. Copia esa dirección completa.

**Alternativas** (si ya usas alguna, funcionan igual de bien): GitHub Pages o Vercel — ambas requieren una cuenta y un poco más de pasos, pero Netlify Drop es la opción de cero configuración.

### Configurar la URL final

1. Abre `config.js` otra vez.
2. Pega tu dirección de Netlify en `APP_URL`:
   ```js
   const APP_URL = "https://curious-lovelace-abc123.netlify.app";
   ```
3. Guarda el archivo.
4. **Vuelve a subir la carpeta a Netlify Drop** (arrástrala de nuevo) para que la nueva versión, con la URL ya configurada, quede publicada. (Si arrastras la misma carpeta al mismo recuadro, Netlify actualiza el mismo sitio — no crea uno nuevo.)

A partir de ahora, abre la app SIEMPRE desde esa dirección de Netlify (no desde el archivo local) — tanto tú como los estudiantes.

---

## 4. Generar y usar el QR

No tienes que hacer nada adicional: en cuanto `APP_URL` esté configurado, el **Host Dashboard → pestaña Overview** genera el código QR automáticamente y lo muestra bajo "JOIN THE CHALLENGE", junto con el enlace en texto por si alguien prefiere escribirlo a mano. Solo proyecta esa pantalla el día de la clase.

---

## 5. Cómo usar el Host Dashboard el día de la clase

Entra a tu URL de Netlify + agrega `?host=1` al final (por ejemplo `https://curious-lovelace-abc123.netlify.app/?host=1`), o usa el enlace "Host login" y escribe tu contraseña (`fic2026` por defecto, cámbiala en `config.js`).

Flujo recomendado, paso a paso:

1. Abre el Host Dashboard y **proyecta la pestaña "Overview"** — ahí está el QR.
2. Pide a los estudiantes que escaneen el QR y escriban su nombre. Verás el contador de participantes subir en vivo.
3. Cuando todos hayan entrado, haz clic en **"GENERATE TEAMS"**. Verás la animación de formación de equipos en los celulares de los estudiantes.
4. Cada equipo le pone nombre a su equipo y confirma ("LOCK TEAM NAME"). Puedes ver el progreso en la pestaña **"Equipos"**.
5. Cuando todos los equipos estén listos, haz clic en **"START CHALLENGE"** — la Pregunta 1 aparece en todos los celulares al mismo tiempo. No hay cronómetro: los equipos discuten con calma.
6. Ve a la pestaña **"Preguntas"** para ver en vivo qué equipos ya respondieron, su respuesta, su explicación y su puntaje automático.
7. Cuando la mayoría de equipos haya respondido, haz clic en **"NEXT QUESTION"**. Repite hasta la Pregunta 5.
8. (Opcional pero recomendado) En la pestaña "Preguntas", lee las explicaciones y usa los botones **0 / +5 / +10** para ajustar el puntaje de razonamiento si consideras que el sistema automático fue muy generoso o muy estricto con algún equipo.
9. Haz clic en **"REVEAL LEADERBOARD"** — se muestra la animación "AND THE WINNER IS…" seguida del ranking final, tanto en tu pantalla como en los celulares de los estudiantes.
10. Haz clic en **"END CHALLENGE"** para cerrar la sesión formalmente.
11. Usa el botón **"🖥 Abrir vista de proyector"** en cualquier momento para abrir una pantalla grande, de solo lectura, ideal para proyectar (no necesita contraseña, no tiene controles).

### Herramientas si algo sale mal a mitad de clase

- **Un estudiante se equivocó de equipo o quiere cambiarse:** pestaña "Participantes" → columna "Mover a" → elige el equipo correcto.
- **Alguien no pudo registrarse (wifi lento, etc.):** pestaña "Overview" → "Agregar participante manual".
- **Un equipo quiere otro nombre:** pestaña "Overview" → "Renombrar equipo".
- **Alguien se registró por error y hay que quitarlo:** pestaña "Participantes" → botón "Quitar".
- **Los equipos quedaron mal armados y aún no ha empezado el reto:** botón "RESHUFFLE TEAMS" (te va a preguntar confirmación porque borra las respuestas ya enviadas, si las hubiera).
- **Quieres reiniciar solo el registro (los nombres se ensuciaron):** botón "Reset participants".
- **Quieres reiniciar todo el reto desde cero** (por ejemplo, para dictar la clase una segunda vez el mismo día): botón "Reset challenge".

---

## 6. Seguridad y anti-trampa — qué protege esto y qué no (léelo, es importante)

Esta app **no tiene seguridad de nivel bancario**, y es honesto decirlo:

- **La contraseña del Host Dashboard** (`fic2026` en `config.js`) es un disuasivo simple, no una cuenta real. Cualquiera que la vea puede entrar como facilitador. Cámbiala por algo que tus estudiantes no puedan adivinar, y no la compartas en la pantalla proyectada.
- **Lo que SÍ logra usar Firebase en vez de guardar todo solo en el navegador del estudiante:** si un estudiante abre las herramientas de desarrollador de su navegador y edita el HTML/JS de SU propio celular, eso **no cambia lo que ven los demás ni lo que ve tu Host Dashboard** — porque el puntaje real vive en la base de datos en la nube (Firebase), no en la página que él ve. Esto bloquea la trampa más obvia y realista en una clase de 40 minutos: editar la página para "verse" con 100 puntos.
- **Lo que NO logra bloquear:** un estudiante con conocimientos técnicos avanzados que sepa usar las herramientas de desarrollador podría, en teoría, llamar directamente a las funciones de Firebase para escribir un puntaje falso en la base de datos — igual que podría hacerlo con casi cualquier app hecha sin un servidor propio de por medio (Kahoot, Mentimeter y herramientas similares tienen el mismo tipo de límite del lado del cliente). Evitar esto por completo requeriría un servidor con lógica de validación (Cloud Functions), lo cual ya no es una instalación de 15 minutos para alguien sin experiencia en programación — por eso quedó fuera a propósito.
- En la práctica, para una clase de 40 minutos con estudiantes de pregrado, el riesgo real es bajísimo y el diseño actual (Firebase + reglas básicas) es un balance razonable entre "funciona de verdad" y "cualquiera lo puede configurar".

---

## 7. Ensayo antes de clase (checklist)

- [ ] Configuraste `BACKEND_MODE = "firebase"` y pegaste tu `FIREBASE_CONFIG` real.
- [ ] Publicaste la carpeta en Netlify (o similar) y pegaste esa URL en `APP_URL`.
- [ ] Volviste a subir la carpeta después de fijar `APP_URL` (para que el QR quede correcto).
- [ ] Probaste el flujo completo TÚ MISMA usando tu celular (con datos móviles, no wifi del campus) + tu laptop, para confirmar que sí se sincronizan como dispositivos distintos.
- [ ] Cambiaste `HOST_PASSWORD` a algo propio.
- [ ] Cambiaste `SESSION_ID` si vas a dictar la clase más de una vez (usa uno distinto por sesión para no mezclar datos).
- [ ] Hiciste clic en "Reset challenge" justo antes de que lleguen los estudiantes, para empezar de una base limpia.
- [ ] Tienes este archivo (`SETUP_GUIDE.md`) a mano por si necesitas repetir un paso rápido.

## 8. Si algo falla durante la clase

- **El QR no carga / "no se pudo cargar":** la app SIEMPRE muestra el enlace en texto debajo del QR — pide a los estudiantes que lo escriban directamente en el navegador de su celular.
- **Un estudiante no ve el reto avanzar:** pídele que recargue la página (no pierde su equipo, porque su equipo vive en la base de datos, no en su celular — solo su nombre para identificarse en esa pestaña se reinicia si cierra la pestaña por completo, no con un simple refresh).
- **Se cae el internet del salón:** en modo Firebase, todos los dispositivos (incluida tu laptop) necesitan internet. Si el internet del salón se cae por completo, no hay forma de continuar en modo Firebase — como alternativa de emergencia, puedes cambiar sobre la marcha a discutir las 5 preguntas de forma oral/proyectada usando el PPTX de la Masterclass individual como respaldo.
- **Quieres repetir la clase con otro grupo el mismo día:** cambia `SESSION_ID` en `config.js` a algo distinto (ej. `fic-gmat-challenge-2026-pm`), vuelve a subir la carpeta, y tendrás un reto completamente vacío y nuevo sin tocar nada más.
