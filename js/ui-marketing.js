"use strict";
/* MINY Logistics · Pantalla: Marketing (13) — fotos, textos, ficha técnica e imágenes para redes */
(function (global) {
  const { U, Store } = global.MINY;
  const UI = global.MINY.UI;
  const Mk = () => global.MINY.Marketing;
  const Fo = () => global.MINY.Fotos;
  const Dom = () => global.MINY.Dominio;
  const { $, esc } = UI;

  /* ---------- Dibujo de imágenes (canvas) ---------- */
  const TEMAS = {
    morado: { nombre: "Morado MINY", fondo: ["#4338ca", "#7c3aed"], texto: "#ffffff", acento: "#fde68a", acentoTexto: "#3b0764", panel: "rgba(255,255,255,.16)" },
    oscuro: { nombre: "Oscuro", fondo: ["#111827", "#312e81"], texto: "#ffffff", acento: "#a78bfa", acentoTexto: "#111827", panel: "rgba(255,255,255,.10)" },
    claro: { nombre: "Claro", fondo: ["#f5f3ff", "#ede9fe"], texto: "#24234c", acento: "#7c3aed", acentoTexto: "#ffffff", panel: "rgba(67,56,202,.10)" },
    calido: { nombre: "Cálido", fondo: ["#f97316", "#db2777"], texto: "#ffffff", acento: "#fef3c7", acentoTexto: "#7c2d12", panel: "rgba(255,255,255,.18)" }
  };
  const TIPOS_IMG = { historia: { t: "Historia (9:16)", w: 1080, h: 1920 }, post: { t: "Publicación (1:1)", w: 1080, h: 1080 }, ficha: { t: "Ficha técnica (4:5)", w: 1080, h: 1350 } };
  const FUENTE = '"Inter","Segoe UI",Arial,sans-serif';

  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function fotoCover(g, img, x, y, w, h, r, th, inicial) {
    g.save(); rr(g, x, y, w, h, r); g.clip();
    if (img) { const s = Math.max(w / img.width, h / img.height); const dw = img.width * s, dh = img.height * s; g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
    else { g.fillStyle = th.panel; g.fillRect(x, y, w, h); g.fillStyle = th.acento; g.font = `800 ${Math.round(h * 0.4)}px ${FUENTE}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(inicial, x + w / 2, y + h / 2); }
    g.restore();
  }
  function ajustar(g, texto, maxW, tam, min, peso) {
    let s = tam; g.font = `${peso} ${s}px ${FUENTE}`;
    while (s > min && g.measureText(texto).width > maxW) { s -= 2; g.font = `${peso} ${s}px ${FUENTE}`; }
    return s;
  }
  function envolver(g, texto, maxW, maxLineas) {
    const palabras = String(texto).split(/\s+/); const lineas = []; let actual = "";
    palabras.forEach((w) => { const t = actual ? actual + " " + w : w; if (g.measureText(t).width <= maxW || !actual) actual = t; else { lineas.push(actual); actual = w; } });
    if (actual) lineas.push(actual);
    if (lineas.length > maxLineas) { const ult = lineas.slice(0, maxLineas); let l = ult[maxLineas - 1]; while (l.length > 1 && g.measureText(l + "…").width > maxW) l = l.slice(0, -1); ult[maxLineas - 1] = l + "…"; return ult; }
    return lineas;
  }
  function dibujar(canvas, c) {
    const tipo = TIPOS_IMG[c.tipo] ? c.tipo : "historia"; const { w: W, h: H } = TIPOS_IMG[tipo]; const th = TEMAS[c.tema] || TEMAS.morado;
    canvas.width = W; canvas.height = H; const g = canvas.getContext("2d");
    const fondo = g.createLinearGradient(0, 0, W * 0.4, H); fondo.addColorStop(0, th.fondo[0]); fondo.addColorStop(1, th.fondo[1]); g.fillStyle = fondo; g.fillRect(0, 0, W, H);
    g.fillStyle = th.panel; g.beginPath(); g.arc(W * 0.92, H * 0.06, 260, 0, Math.PI * 2); g.fill();
    const inicial = (c.nombre || "?").trim().charAt(0).toUpperCase();
    const ctaTxt = [c.ctaTexto, c.contacto].filter(Boolean).join(" · ");
    g.textBaseline = "alphabetic";
    const centrado = (txt, y, tam, peso, color, min) => { g.fillStyle = color; g.textAlign = "center"; ajustar(g, txt, W - 140, tam, min || 24, peso); g.fillText(txt, W / 2, y); };

    if (tipo === "historia") {
      if (c.negocio) centrado(c.negocio, 120, 50, 700, th.texto);
      fotoCover(g, c.img, 90, 190, 900, 900, 48, th, inicial);
      if (c.oferta) { g.font = `800 44px ${FUENTE}`; const s = ajustar(g, c.oferta, 800, 44, 26, 800); const tw = Math.min(860, g.measureText(c.oferta).width + 80); g.fillStyle = th.acento; rr(g, (W - tw) / 2, 1050, tw, 100, 50); g.fill(); g.fillStyle = th.acentoTexto; g.textAlign = "center"; g.font = `800 ${s}px ${FUENTE}`; g.fillText(c.oferta, W / 2, 1050 + 50 + s * 0.35); }
      g.fillStyle = th.texto; g.textAlign = "center"; g.font = `800 80px ${FUENTE}`;
      envolver(g, c.nombre, 900, 2).forEach((l, i) => g.fillText(l, W / 2, 1275 + i * 92));
      if (c.mostrarPrecio) { g.fillStyle = th.acento; ajustar(g, c.precio, 900, 130, 60, 800); g.fillText(c.precio, W / 2, 1565); }
      if (ctaTxt) { g.fillStyle = th.panel; rr(g, 90, 1680, 900, 140, 40); g.fill(); centrado(ctaTxt, 1765, 44, 700, th.texto, 24); }
    } else if (tipo === "post") {
      fotoCover(g, c.img, 60, 60, 960, 600, 48, th, inicial);
      if (c.oferta) { const s = ajustar(g, c.oferta, 640, 38, 24, 800); const tw = Math.min(760, g.measureText(c.oferta).width + 60); g.fillStyle = th.acento; rr(g, 90, 90, tw, 78, 39); g.fill(); g.fillStyle = th.acentoTexto; g.textAlign = "left"; g.font = `800 ${s}px ${FUENTE}`; g.fillText(c.oferta, 120, 90 + 39 + s * 0.35); }
      g.fillStyle = th.texto; g.textAlign = "left"; g.font = `800 66px ${FUENTE}`;
      envolver(g, c.nombre, 960, 2).forEach((l, i) => g.fillText(l, 60, 760 + i * 76));
      if (c.mostrarPrecio) { g.fillStyle = th.acento; ajustar(g, c.precio, 960, 100, 50, 800); g.fillText(c.precio, 60, 945); }
      if (ctaTxt) { g.fillStyle = th.texto; ajustar(g, ctaTxt, 960, 36, 22, 600); g.globalAlpha = 0.9; g.fillText(ctaTxt, 60, 1025); g.globalAlpha = 1; }
    } else {
      if (c.negocio) centrado(c.negocio, 90, 44, 700, th.texto);
      centrado("FICHA TÉCNICA", 145, 34, 800, th.acento);
      fotoCover(g, c.img, 60, 180, 960, 480, 40, th, inicial);
      g.fillStyle = th.texto; g.textAlign = "center"; ajustar(g, c.nombre, 960, 60, 32, 800); g.fillText(c.nombre, W / 2, 735);
      const filas = c.ficha.filter((f) => f[0] !== "Producto" && (c.mostrarPrecio || f[0] !== "Precio")).slice(0, 9);
      filas.forEach((f, i) => {
        const y = 780 + i * 52; const esPrecio = f[0] === "Precio";
        if (i % 2 === 0 || esPrecio) { g.fillStyle = esPrecio ? th.acento : th.panel; rr(g, 60, y, 960, 48, 14); g.fill(); }
        g.fillStyle = esPrecio ? th.acentoTexto : th.texto; g.textAlign = "left"; g.font = `700 28px ${FUENTE}`; const lab = envolver(g, f[0], 330, 1)[0]; g.fillText(lab, 84, y + 33);
        g.textAlign = "right"; const maxV = 960 - 330 - 60; ajustar(g, f[1], maxV, 28, 18, 600); let val = f[1]; while (val.length > 1 && g.measureText(val).width > maxV) val = val.slice(0, -2) + "…"; g.fillText(val, 996, y + 33);
      });
      if (ctaTxt) centrado(ctaTxt, 1310, 32, 600, th.texto, 20);
    }
  }

  /* ---------- Pantalla ---------- */
  let sel = null, fotos = [], img = null, estaTrabajando = false;
  const copiar = async (id) => {
    const t = $(id).value;
    try { await navigator.clipboard.writeText(t); }
    catch (e) { $(id).select(); document.execCommand && document.execCommand("copy"); }
    UI.mensaje("Texto copiado. Ya puedes pegarlo en tu red social o chat.");
  };
  const contexto = (d) => ({ negocio: d.config.negocio || "", ...(d.config.marketing || {}) });

  UI.vistas.marketing = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("PROMOCIÓN", "Marketing", "Sube fotos, genera descripciones, fichas técnicas e imágenes para historias y publicaciones.")}
        <div class="aviso aviso-info">Los textos se arman con <strong>plantillas</strong> a partir de los datos de tu producto y de las características que escribas (no son inteligencia artificial y no inventan cualidades). Las fotos se guardan en tu cuenta (almacenamiento privado en la nube) y las ves desde cualquier dispositivo donde inicies sesión.</div>
        <details class="panel"><summary><strong>Datos de contacto para tus piezas</strong> (WhatsApp, Instagram, ciudad)</summary>
          <form id="mkContactoForm" class="form-grid" novalidate><label>WhatsApp (con indicativo)<input id="mkWhatsapp" maxlength="20" placeholder="+57 300 123 4567" inputmode="tel"></label><label>Instagram (sin @)<input id="mkInstagram" maxlength="40"></label><label>Ciudad<input id="mkCiudad" maxlength="60"></label>
          <div class="form-actions full-width"><button class="btn btn-primary" type="submit">Guardar contacto</button></div></form></details>
        <div class="panel"><h3>1. Elige el producto</h3><div class="filters-bar"><input id="mkBuscar" type="search" placeholder="Buscar por nombre, SKU o código…" aria-label="Buscar producto"><select id="mkProducto" aria-label="Producto"></select></div><p id="mkVacio" class="empty-state" hidden>Primero registra productos en el módulo Productos.</p></div>
        <div id="mkTrabajo" hidden>
          <div class="panel"><h3>2. Fotos del producto <small class="muted">(hasta ${Fo().MAX_FOTOS}; la primera es la principal)</small></h3>
            <div class="button-row"><label class="btn btn-light file-button" for="mkArchivo">📷 Subir fotos</label><input id="mkArchivo" type="file" accept="image/*" multiple hidden></div>
            <div id="mkFotos" class="fotos-grid"></div></div>
          <div class="panel"><h3>3. Datos para vender</h3>
            <div class="form-grid">
              <label class="full-width">Características (una por línea; puedes usar “Material: acero”)<textarea id="mkCaracteristicas" rows="5" maxlength="1200" placeholder="Material: acrílico&#10;Tamaño: 5 cm&#10;Incluye cadena"></textarea></label>
              <label>Público al que va dirigido (opcional)<input id="mkPublico" maxlength="120" placeholder="Ej. fans del anime"></label>
              <label>Oferta o promoción (opcional)<input id="mkOferta" maxlength="120" placeholder="Ej. 2x1 hasta el viernes"></label>
              <label>Llamado a la acción<select id="mkCta"></select></label>
              <label>Tono<select id="mkTono"></select></label>
              <div class="form-actions full-width"><button id="mkGenerar" class="btn btn-primary" type="button">✨ Generar textos</button><button id="mkOtra" class="btn btn-light" type="button">Otra versión</button></div></div></div>
          <div class="panel"><h3>4. Textos listos para copiar</h3><p class="muted">Puedes editarlos antes de copiarlos. Usa “Guardar textos” para conservarlos en el producto.</p>
            <div class="form-grid1">
              ${[["mkCorta", "Descripción corta", 2], ["mkLarga", "Descripción larga (catálogo o tienda)", 8], ["mkPub", "Publicación para redes", 9], ["mkWa", "Mensaje de WhatsApp", 6], ["mkTags", "Hashtags", 2]].map(([id, t, f]) => `<label>${t}<textarea id="${id}" rows="${f}"></textarea></label><div class="button-row"><button class="btn btn-light btn-small" type="button" data-copiar="${id}">Copiar</button>${id === "mkWa" ? '<button class="btn btn-light btn-small" type="button" id="mkCompartirWa">Abrir en WhatsApp</button>' : ""}</div>`).join("")}
              <div class="form-actions"><button id="mkGuardarTextos" class="btn btn-primary" type="button">Guardar textos</button></div></div></div>
          <div class="panel"><h3>5. Ficha técnica</h3><div id="mkFicha"></div></div>
          <div class="panel"><h3>6. Imágenes para redes</h3>
            <div class="filters-bar"><label class="inline-field">Formato<select id="mkTipoImg"></select></label><label class="inline-field">Estilo<select id="mkTema"></select></label><label class="check"><input id="mkPrecioImg" type="checkbox" checked> Mostrar precio</label><button id="mkDescargar" class="btn btn-primary" type="button">⬇️ Descargar imagen (PNG)</button></div>
            <div class="canvas-wrap"><canvas id="mkCanvas" width="1080" height="1920" aria-label="Vista previa de la imagen"></canvas></div></div>
        </div>`;
      $("mkCta").innerHTML = UI.opciones(Object.entries(Mk().CTAS).map(([v, t]) => ({ v, t })), "whatsapp");
      $("mkTono").innerHTML = UI.opciones(Object.entries(Mk().TONOS).map(([v, t]) => ({ v, t })), "cercano");
      $("mkTipoImg").innerHTML = UI.opciones(Object.entries(TIPOS_IMG).map(([v, o]) => ({ v, t: o.t })), "historia");
      $("mkTema").innerHTML = UI.opciones(Object.entries(TEMAS).map(([v, o]) => ({ v, t: o.nombre })), "morado");

      $("mkBuscar").addEventListener("input", () => this.selector());
      $("mkProducto").addEventListener("change", () => this.elegir($("mkProducto").value));
      $("mkContactoForm").addEventListener("submit", async (e) => { e.preventDefault(); if ((await UI.intentar(() => Mk().guardarContacto({ whatsapp: $("mkWhatsapp").value, instagram: $("mkInstagram").value, ciudad: $("mkCiudad").value }), "Contacto guardado.")).ok) this.redibujar(); });
      $("mkArchivo").addEventListener("change", (e) => this.subir(e));
      $("mkFotos").addEventListener("click", (e) => this.accionFoto(e));
      ["mkCaracteristicas", "mkPublico", "mkOferta"].forEach((id) => $(id).addEventListener("input", () => this.redibujar()));
      ["mkCaracteristicas", "mkPublico", "mkOferta", "mkCta", "mkTono"].forEach((id) => $(id).addEventListener("change", () => this.guardarOpciones()));
      ["mkTipoImg", "mkTema", "mkPrecioImg", "mkCta"].forEach((id) => $(id).addEventListener("change", () => this.redibujar()));
      $("mkGenerar").addEventListener("click", () => this.generar(false));
      $("mkOtra").addEventListener("click", () => this.generar(true));
      $("mkGuardarTextos").addEventListener("click", () => this.guardarTextos());
      sec.addEventListener("click", (e) => { const b = e.target.closest("[data-copiar]"); if (b) copiar(b.dataset.copiar); });
      $("mkCompartirWa").addEventListener("click", () => { const t = $("mkWa").value.trim(); if (!t) return UI.mensaje("Primero genera el mensaje.", "error"); window.open("https://wa.me/?text=" + encodeURIComponent(t), "_blank", "noopener"); });
      $("mkDescargar").addEventListener("click", () => this.descargar());
    },
    limpiar() { sel = null; fotos.forEach((f) => URL.revokeObjectURL(f.url)); fotos = []; img = null; if ($("mkTrabajo")) $("mkTrabajo").hidden = true; },
    actualizar() {
      const d = Store.leer(); const c = d.config.marketing || {};
      $("mkWhatsapp").value = c.whatsapp || ""; $("mkInstagram").value = c.instagram || ""; $("mkCiudad").value = c.ciudad || "";
      this.selector();
      if (sel && Dom().productoDe(d, sel)) this.elegir(sel, true); else { sel = null; $("mkTrabajo").hidden = true; }
    },
    selector() {
      const d = Store.leer();
      const lista = Dom().buscarProductos(d, $("mkBuscar").value, { soloActivos: true });
      $("mkVacio").hidden = d.productos.length > 0;
      $("mkProducto").innerHTML = `<option value="">Selecciona un producto (${lista.length})</option>` + lista.map((p) => `<option value="${esc(p.id)}"${p.id === sel ? " selected" : ""}>${esc(p.nombre)} · ${esc(p.codigo)}</option>`).join("");
    },
    async elegir(id, mantener) {
      if (!id) { sel = null; $("mkTrabajo").hidden = true; return; }
      const d = Store.leer(); const p = Dom().productoDe(d, id); if (!p) return;
      const cambio = sel !== id; sel = id;
      const m = Mk().datos(p);
      if (cambio || !mantener) {
        $("mkCaracteristicas").value = m.caracteristicas; $("mkPublico").value = m.publico; $("mkOferta").value = m.oferta; $("mkCta").value = m.cta; $("mkTono").value = m.tono;
        const t = m.textos || { corta: "", larga: "", publicacion: "", whatsapp: "", hashtags: "" };
        $("mkCorta").value = t.corta; $("mkLarga").value = t.larga; $("mkPub").value = t.publicacion; $("mkWa").value = t.whatsapp; $("mkTags").value = t.hashtags;
      }
      $("mkTrabajo").hidden = false;
      await this.cargarFotos();
    },
    async cargarFotos() {
      const d = Store.leer(); const p = Dom().productoDe(d, sel); if (!p) return;
      fotos.forEach((f) => URL.revokeObjectURL(f.url)); fotos = []; let faltan = 0;
      for (const id of Mk().datos(p).fotoIds) {
        try { const r = await Fo().obtener(id); if (r) fotos.push({ id, url: URL.createObjectURL(r.blob), blob: r.blob }); else faltan++; } catch (e) { faltan++; }
      }
      $("mkFotos").innerHTML = (fotos.length ? fotos.map((f, i) => `<figure class="foto"><img src="${f.url}" alt="Foto ${i + 1} de ${esc(p.nombre)}">${i === 0 ? '<span class="status-pill done">Principal</span>' : `<button class="table-action" data-principal="${esc(f.id)}" type="button">Hacer principal</button>`}<button class="table-action danger" data-quitar="${esc(f.id)}" type="button">Quitar</button></figure>`).join("") : '<p class="empty-state">Este producto aún no tiene fotos. Sube la primera; también puedes generar imágenes sin foto.</p>')
        + (faltan ? `<p class="muted">${faltan} foto(s) de este producto no se pudieron cargar. Vuelve a subirlas si ya no aparecen.</p>` : "");
      img = null;
      if (fotos.length) { try { img = await createImageBitmap(fotos[0].blob); } catch (e) { img = null; } }
      this.redibujar();
    },
    async subir(e) {
      const archivos = [...e.target.files]; e.target.value = ""; if (!archivos.length || !sel) return;
      let ok = 0, ultimoError = "";
      for (const a of archivos) { try { await Fo().agregar(sel, a); ok++; } catch (err) { ultimoError = err.message; } }
      if (ok) UI.mensaje(`${ok} foto(s) guardada(s)` + (ultimoError ? `. Algunas no se pudieron guardar: ${ultimoError}` : "."));
      else UI.mensaje(ultimoError || "No se pudo guardar la foto.", "error");
      await this.cargarFotos();
    },
    async accionFoto(e) {
      const pr = e.target.closest("[data-principal]"), qu = e.target.closest("[data-quitar]");
      if (pr && (await UI.intentar(() => Fo().principal(sel, pr.dataset.principal), "Foto principal actualizada.")).ok) await this.cargarFotos();
      if (qu) {
        if (!(await UI.confirmar("¿Quitar esta foto del producto? No se puede deshacer.", { titulo: "Quitar foto", ok: "Quitar", peligro: true }))) return;
        try { await Fo().quitar(sel, qu.dataset.quitar); UI.mensaje("Foto eliminada."); } catch (err) { UI.mensaje(err.message, "error"); }
        await this.cargarFotos();
      }
    },
    opciones() { return { caracteristicas: $("mkCaracteristicas").value, publico: $("mkPublico").value, oferta: $("mkOferta").value, cta: $("mkCta").value, tono: $("mkTono").value }; },
    async guardarOpciones() { if (sel) try { await Mk().guardar(sel, this.opciones()); } catch (e) { UI.mensaje(e.message, "error"); } },
    async generar(otra) {
      if (!sel) return;
      const r = await UI.intentar(async () => {
        const d = Store.leer(); const p = Dom().productoDe(d, sel); const m = Mk().datos(p);
        const variante = otra ? m.variante + 1 : m.variante;
        const t = Mk().generar(p, this.opciones(), variante, contexto(d));
        await Mk().guardar(sel, { ...this.opciones(), variante, textos: t });
        return t;
      });
      if (!r.ok) return;
      const t = r.valor;
      $("mkCorta").value = t.corta; $("mkLarga").value = t.larga; $("mkPub").value = t.publicacion; $("mkWa").value = t.whatsapp; $("mkTags").value = t.hashtags;
      UI.mensaje(otra ? "Nueva versión generada y guardada." : "Textos generados y guardados. Puedes editarlos y copiarlos.");
      this.redibujar();
    },
    async guardarTextos() {
      if (!sel) return;
      await UI.intentar(() => Mk().guardar(sel, { ...this.opciones(), textos: { corta: $("mkCorta").value, larga: $("mkLarga").value, publicacion: $("mkPub").value, whatsapp: $("mkWa").value, hashtags: $("mkTags").value } }), "Textos guardados en el producto.");
    },
    redibujar() {
      if (!sel || $("mkTrabajo").hidden) return;
      const d = Store.leer(); const p = Dom().productoDe(d, sel); if (!p) return;
      const o = this.opciones(); const ctx = contexto(d);
      const ficha = Mk().fichaTecnica(p, o.caracteristicas);
      $("mkFicha").innerHTML = UI.tabla([{ t: "Concepto", f: (f) => `<strong>${esc(f[0])}</strong>` }, { t: "Detalle", f: (f) => esc(f[1]) }], ficha);
      dibujar($("mkCanvas"), {
        tipo: $("mkTipoImg").value, tema: $("mkTema").value, nombre: p.nombre, precio: U.dinero(p.precio), mostrarPrecio: $("mkPrecioImg").checked, oferta: o.oferta.trim(), negocio: ctx.negocio,
        ctaTexto: Mk().CTAS[o.cta], contacto: [ctx.whatsapp, ctx.instagram ? "@" + ctx.instagram : ""].filter(Boolean).join(" · "), img, ficha
      });
    },
    descargar() {
      if (!sel) return; const p = Dom().productoDe(Store.leer(), sel); this.redibujar();
      $("mkCanvas").toBlob((b) => {
        if (!b) return UI.mensaje("No se pudo generar la imagen.", "error");
        UI.descargar(`miny-${$("mkTipoImg").value}-${U.normalizar(p.codigo).replace(/[^a-z0-9]+/g, "-")}.png`, b, "image/png");
        UI.mensaje("Imagen descargada. Ya puedes subirla a tus historias o publicaciones.");
      }, "image/png");
    }
  };
})(window);
