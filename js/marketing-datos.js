"use strict";
/*
 * MINY Logistics · MARKETING (datos y generador de textos)
 * - Fotos: se guardan reducidas en IndexedDB (almacén del navegador con más espacio que localStorage).
 * - Textos: se generan con plantillas a partir de los datos reales del producto y de las
 *   características que escribe el usuario. No se inventan cualidades del producto.
 * - Los textos guardados viven en producto.marketing (así entran en el respaldo normal).
 */
(function (global) {
  const { U, Store, ErrorNegocio } = global.MINY;
  const MAX_FOTOS = 6, MAX_LADO = 1400, MAX_BYTES_ARCHIVO = 20 * 1024 * 1024;

  /* ---------- Fotos en IndexedDB ---------- */
  let dbPromesa = null;
  function abrir() {
    if (dbPromesa) return dbPromesa;
    dbPromesa = new Promise((res, rej) => {
      if (!global.indexedDB) return rej(new ErrorNegocio("Este navegador no permite guardar fotos (IndexedDB no disponible)."));
      const r = global.indexedDB.open("minyFotos", 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore("fotos", { keyPath: "id" }); s.createIndex("productoId", "productoId"); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(new ErrorNegocio("No se pudo abrir el almacén de fotos del navegador."));
    });
    dbPromesa.catch(() => { dbPromesa = null; });
    return dbPromesa;
  }
  function tx(modo, fn) {
    return abrir().then((db) => new Promise((res, rej) => {
      const t = db.transaction("fotos", modo);
      let salida;
      const rq = fn(t.objectStore("fotos"));
      if (rq) rq.onsuccess = () => { salida = rq.result; };
      t.oncomplete = () => res(salida);
      t.onerror = () => rej(t.error || new Error("Error de almacenamiento de fotos"));
      t.onabort = () => rej(t.error || new ErrorNegocio("No se pudo guardar la foto (¿almacenamiento lleno?)."));
    }));
  }
  /** Reduce la foto a un máximo de 1400 px y la convierte a JPEG para ahorrar espacio. */
  async function reducir(archivo) {
    if (!archivo || !/^image\//.test(archivo.type || "")) throw new ErrorNegocio("El archivo no es una imagen (usa JPG, PNG o WEBP).");
    if (archivo.size > MAX_BYTES_ARCHIVO) throw new ErrorNegocio("La imagen pesa más de 20 MB. Elige una más liviana.");
    let bmp;
    try { bmp = await createImageBitmap(archivo); }
    catch (e) { throw new ErrorNegocio("No se pudo leer la imagen. Prueba con otra foto (JPG o PNG)."); }
    const esc = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * esc)); c.height = Math.max(1, Math.round(bmp.height * esc));
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new ErrorNegocio("No se pudo procesar la imagen."))), "image/jpeg", 0.85));
  }
  const Fotos = {
    MAX_FOTOS, reducir,
    async agregar(productoId, archivo) {
      const d = Store.leer(); const p = global.MINY.Dominio.productoDe(d, productoId);
      if (!p) throw new ErrorNegocio("Selecciona un producto.");
      if (Marketing.datos(p).fotoIds.length >= MAX_FOTOS) throw new ErrorNegocio(`Cada producto admite hasta ${MAX_FOTOS} fotos.`);
      const blob = await reducir(archivo);
      const id = U.id();
      await tx("readwrite", (s) => s.put({ id, productoId, blob, creado: U.ahora() }));
      try {
        Store.transaccion((x) => { const q = x.productos.find((r) => r.id === productoId); if (!q) throw new ErrorNegocio("El producto ya no existe."); q.marketing = Marketing.completar(q.marketing); if (q.marketing.fotoIds.length >= MAX_FOTOS) throw new ErrorNegocio(`Cada producto admite hasta ${MAX_FOTOS} fotos.`); q.marketing.fotoIds.push(id); });
      } catch (e) { await tx("readwrite", (s) => s.delete(id)); throw e; }
      return id;
    },
    async obtener(id) { return tx("readonly", (s) => s.get(id)); },
    async quitar(productoId, id) {
      Store.transaccion((x) => { const q = x.productos.find((r) => r.id === productoId); if (q && q.marketing) q.marketing.fotoIds = q.marketing.fotoIds.filter((f) => f !== id); });
      await tx("readwrite", (s) => s.delete(id));
    },
    principal(productoId, id) {
      Store.transaccion((x) => { const q = x.productos.find((r) => r.id === productoId); if (!q || !q.marketing) throw new ErrorNegocio("Producto no encontrado."); q.marketing.fotoIds = [id, ...q.marketing.fotoIds.filter((f) => f !== id)]; });
    },
    async eliminarDeProducto(productoId) {
      try {
        const todas = await tx("readonly", (s) => s.index("productoId").getAllKeys(productoId));
        await tx("readwrite", (s) => { (todas || []).forEach((k) => s.delete(k)); });
      } catch (e) { console.warn("No se pudieron limpiar las fotos del producto", e); }
    },
    async exportar() {
      const todas = (await tx("readonly", (s) => s.getAll())) || [];
      const leer = (blob) => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(blob); });
      const fotos = [];
      for (const r of todas) fotos.push({ id: r.id, productoId: r.productoId, creado: r.creado, imagen: await leer(r.blob) });
      return { app: "MINY Logistics", formato: "MINY-fotos", version: 1, fechaExportacion: U.ahora(), fotos };
    },
    /** Valida y mezcla las fotos de un archivo de respaldo de fotos. Devuelve cuántas se agregaron. */
    async importar(obj) {
      if (!obj || obj.formato !== "MINY-fotos" || !Array.isArray(obj.fotos)) throw new ErrorNegocio("El archivo no es un respaldo de fotos de MINY Logistics.");
      const buenas = obj.fotos.filter((f) => f && typeof f.id === "string" && typeof f.productoId === "string" && typeof f.imagen === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(f.imagen));
      if (buenas.length !== obj.fotos.length) throw new ErrorNegocio("El archivo de fotos está dañado o incompleto. No se importó nada.");
      for (const f of buenas) { const blob = await (await fetch(f.imagen)).blob(); await tx("readwrite", (s) => s.put({ id: f.id, productoId: f.productoId, blob, creado: f.creado || U.ahora() })); }
      return buenas.length;
    }
  };

  /* ---------- Datos de marketing por producto ---------- */
  const TONOS = { cercano: "Cercano y amable", profesional: "Profesional", divertido: "Divertido" };
  const CTAS = { whatsapp: "Escríbenos por WhatsApp", visitanos: "Visítanos", pedido: "Haz tu pedido hoy", mensaje: "Escríbenos por mensaje directo" };
  const Marketing = {
    TONOS, CTAS,
    completar(m) {
      return { fotoIds: [], caracteristicas: "", publico: "", oferta: "", cta: "whatsapp", tono: "cercano", variante: 0, textos: null, ...(m || {}), fotoIds: Array.isArray(m && m.fotoIds) ? m.fotoIds : [] };
    },
    datos(p) { return Marketing.completar(p && p.marketing); },
    guardar(productoId, cambios) {
      return Store.transaccion((d) => {
        const p = d.productos.find((x) => x.id === productoId);
        if (!p) throw new ErrorNegocio("Producto no encontrado.");
        const m = Marketing.completar(p.marketing);
        const cad = (v, max) => String(v ?? "").slice(0, max);
        if ("caracteristicas" in cambios) m.caracteristicas = cad(cambios.caracteristicas, 1200);
        if ("publico" in cambios) m.publico = cad(cambios.publico, 120);
        if ("oferta" in cambios) m.oferta = cad(cambios.oferta, 120);
        if ("cta" in cambios && CTAS[cambios.cta]) m.cta = cambios.cta;
        if ("tono" in cambios && TONOS[cambios.tono]) m.tono = cambios.tono;
        if ("variante" in cambios && Number.isInteger(cambios.variante)) m.variante = cambios.variante;
        if ("textos" in cambios) {
          const t = cambios.textos;
          m.textos = t ? { corta: cad(t.corta, 400), larga: cad(t.larga, 4000), publicacion: cad(t.publicacion, 3000), whatsapp: cad(t.whatsapp, 3000), hashtags: cad(t.hashtags, 600) } : null;
        }
        m.actualizado = U.ahora();
        p.marketing = m;
        return m;
      });
    },
    guardarContacto(c) {
      return Store.transaccion((d) => {
        const wa = String(c.whatsapp || "").trim();
        if (wa && !/^\+?[0-9 ()-]{7,20}$/.test(wa)) throw new ErrorNegocio("El WhatsApp solo puede tener números, espacios, + ( ) - (entre 7 y 20 caracteres).");
        d.config.marketing = { whatsapp: wa, instagram: String(c.instagram || "").trim().replace(/^@+/, "").slice(0, 40), ciudad: String(c.ciudad || "").trim().slice(0, 60) };
        return d.config.marketing;
      });
    },
    /** "Material: acero" → {label:"Material", value:"acero"}; sin ":" → {label:"Característica", value:texto}. */
    parsearCaracteristicas(texto) {
      return String(texto || "").split(/\r?\n/).map((l) => l.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean).slice(0, 12).map((l) => {
        const i = l.indexOf(":");
        return i > 0 && i < 40 && l.slice(i + 1).trim() ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: "Característica", value: l };
      });
    },
    fichaTecnica(p, caracteristicas) {
      const filas = [["Producto", p.nombre], ["Referencia (SKU)", p.codigo]];
      if (p.categoria) filas.push(["Categoría", p.categoria]);
      if (p.barras) filas.push(["Código de barras", p.barras]);
      filas.push(["Presentación", p.unidad || "unidad"]);
      Marketing.parsearCaracteristicas(caracteristicas).forEach((c) => filas.push([c.label, c.value]));
      filas.push(["Precio", U.dinero(p.precio)]);
      return filas;
    },
    hashtags(p, contexto) {
      const limpiar = (t) => U.normalizar(t).replace(/[^a-z0-9]/g, "");
      const palabras = (t) => String(t || "").split(/\s+/).map(limpiar).filter((w) => w.length > 2);
      const base = [...palabras(p.nombre).slice(0, 3), ...palabras(p.categoria).slice(0, 2), limpiar(contexto.negocio), limpiar(contexto.ciudad), limpiar(contexto.instagram), "emprendimiento", "compralocal", "pymes"];
      return [...new Set(base.filter((w) => w && w.length > 2))].slice(0, 10).map((w) => "#" + w).join(" ");
    },
    /**
     * Genera los textos. "variante" cambia las frases de apertura y cierre (botón "Otra versión").
     * contexto: { negocio, whatsapp, instagram, ciudad }
     */
    generar(p, opc, variante, contexto) {
      const ctx = contexto || {};
      const v = Math.abs(variante || 0);
      const pick = (arr) => arr[v % arr.length];
      const tono = TONOS[opc.tono] ? opc.tono : "cercano";
      const nombre = p.nombre;
      const aperturas = {
        cercano: [`¿Ya conoces ${nombre}?`, `Te presentamos ${nombre}.`, `Mira lo que tenemos para ti: ${nombre}.`],
        profesional: [`Presentamos ${nombre}.`, `Disponible ahora: ${nombre}.`, `${nombre} ya está disponible.`],
        divertido: [`¡Atención! Llegó ${nombre} 🎉`, `Spoiler: ${nombre} está aquí 😍`, `¡Sí, es real! Tenemos ${nombre} ✨`]
      }[tono];
      const cierres = {
        cercano: ["¡Te esperamos!", "Pregúntanos sin compromiso.", "Escríbenos y te contamos todo."],
        profesional: ["Quedamos atentos a tu solicitud.", "Solicita más información con nosotros.", "Consulta condiciones y disponibilidad."],
        divertido: ["¡No te quedes sin el tuyo! 🙌", "¡Corre, que vuelan! 🏃", "¡Escríbenos ya! 💬"]
      }[tono];
      const caracs = Marketing.parsearCaracteristicas(opc.caracteristicas);
      const viñetas = caracs.map((c) => (c.label === "Característica" ? c.value : `${c.label}: ${c.value}`));
      const precio = U.dinero(p.precio);
      const oferta = String(opc.oferta || "").trim();
      const publico = String(opc.publico || "").trim();
      let aviso = "";
      if (p.cantidad <= 0) aviso = "Consulta disponibilidad.";
      else if (p.cantidad <= (p.minimo ?? 0)) aviso = "¡Quedan pocas unidades!";
      const contacto = [ctx.whatsapp ? `WhatsApp ${ctx.whatsapp}` : "", ctx.instagram ? `@${ctx.instagram}` : ""].filter(Boolean).join(" · ");
      const donde = ctx.ciudad ? ` en ${ctx.ciudad}` : "";
      const llamado = {
        whatsapp: `Escríbenos por WhatsApp${ctx.whatsapp ? " al " + ctx.whatsapp : ""}.`,
        visitanos: `Visítanos${donde}${ctx.negocio ? " en " + ctx.negocio : ""}.`,
        pedido: "Haz tu pedido hoy.",
        mensaje: `Escríbenos por mensaje directo${ctx.instagram ? " a @" + ctx.instagram : ""}.`
      }[opc.cta] || "Escríbenos.";

      const primera = ((p.descripcion || "").match(/^[^.!?]*[.!?]?/) || [""])[0].trim() || (viñetas[0] || "");
      const corta = [nombre + (p.categoria ? " · " + p.categoria : ""), primera, precio].filter(Boolean).join(". ").replace(/\.\./g, ".").slice(0, 160);

      const largaPartes = [pick(aperturas)];
      if (p.descripcion) largaPartes.push(p.descripcion);
      if (publico) largaPartes.push(`Pensado para ${publico}.`);
      if (viñetas.length) largaPartes.push("Características:\n" + viñetas.map((x) => "• " + x).join("\n"));
      largaPartes.push(`Precio: ${precio}${p.unidad && p.unidad !== "unidad" ? " por " + p.unidad : ""}.`);
      if (oferta) largaPartes.push(`Oferta: ${oferta}.`);
      if (aviso) largaPartes.push(aviso);
      largaPartes.push(pick(cierres) + " " + llamado);
      const larga = largaPartes.join("\n\n");

      const tags = Marketing.hashtags(p, ctx);
      const pubPartes = [pick(aperturas)];
      if (publico) pubPartes.push(`Ideal para ${publico}.`);
      if (viñetas.length) pubPartes.push(viñetas.slice(0, 4).map((x) => "✔ " + x).join("\n"));
      pubPartes.push(`💲 ${precio}` + (oferta ? `\n🏷️ ${oferta}` : ""));
      if (aviso) pubPartes.push(aviso);
      pubPartes.push(llamado + " " + pick(cierres));
      pubPartes.push(tags);
      const publicacion = pubPartes.join("\n\n");

      const wa = [`Hola 👋 Te comparto ${nombre}.`];
      if (viñetas.length) wa.push(viñetas.slice(0, 4).map((x) => "• " + x).join("\n"));
      wa.push(`Precio: ${precio}` + (oferta ? `\nOferta: ${oferta}` : ""));
      if (aviso) wa.push(aviso);
      wa.push("¿Te lo reservo? " + (contacto ? "(" + contacto + ")" : ""));
      return { corta, larga, publicacion, whatsapp: wa.join("\n\n").trim(), hashtags: tags, ficha: Marketing.fichaTecnica(p, opc.caracteristicas) };
    }
  };

  global.MINY.Fotos = Fotos;
  global.MINY.Marketing = Marketing;
})(typeof window !== "undefined" ? window : globalThis);
