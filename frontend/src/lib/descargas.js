// src/lib/descargas.js
// Descarga de un archivo que ya está en memoria, sin dependencias de React.
//
// Un endpoint protegido no se puede abrir en una pestaña nueva: el token viaja en la cabecera
// Authorization y el navegador no la agrega por su cuenta. Así que el archivo se pide por fetch,
// llega como Blob y se baja materializándolo en una URL y pulsando un <a download> por código.

// Cuánto esperar antes de revocar la URL del Blob.
const MS_ANTES_DE_REVOCAR = 1000;

/**
 * Baja un Blob como archivo.
 *
 * @param {Blob} blob - El contenido, ya en memoria
 * @param {string} nombre - Nombre con el que se ofrece guardarlo
 */
export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);

  try {
    enlace.click();
  } finally {
    // La URL no se revoca justo después del click: hay navegadores que todavía no empezaron a
    // leer el Blob y cancelan la descarga si deja de existir. Y va en el `finally` para que
    // tampoco quede colgada si `click()` lanza, porque una URL sin revocar retiene el archivo
    // entero en memoria hasta que se recargue la página.
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), MS_ANTES_DE_REVOCAR);
  }
}
