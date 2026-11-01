"use strict";
/*
 * MINY Logistics · INTERFAZ BASE
 * Navegación entre módulos, mensajes, diálogos de confirmación y componentes compartidos
 * (tablas, editor de líneas de productos, descargas).
 */
(function (global) {
  const { U, Store, ErrorNegocio } = global.MINY;
  const $ = (id) => document.getElementById(id);
  const esc = U.esc;

  const MODULOS = [
    { id: "inicio", icono: "🏠", titulo: "Inicio", desc: "Resumen general de tu negocio" },
    { id: "productos", icono: "📦", titulo: "Productos", desc: "Catálogo, precios y códigos" },
    { id: "inventario", icono: "📊", titulo: "Inventario", desc: "Existencias y movimientos" },
    { id: "ventas", icono: "🛒", titulo: "Ventas", desc: "Registra y consulta ventas" },
    { id: "cobros", icono: "💳", titulo: "Cobros", desc: "Cartera, abonos y saldos por cobrar" },
    { id: "pedidos", icono: "📋", titulo: "Pedidos", desc: "Seguimiento hasta la entrega" },
    { id: "clientes", icono: "👥", titulo: "Clientes", desc: "Datos e historial de compras" },
    { id: "proveedores", icono: "🚚", titulo: "Proveedores", desc: "Quién te surte mercancía" },
    { id: "compras", icono: "🧾", titulo: "Compras", desc: "Órdenes y recepción" },
    { id: "finanzas", icono: "💰", titulo: "Finanzas", desc: "Ingresos, gastos y resultado" },
    { id: "marketing", icono: "📣", titulo: "Marketing", desc: "Fotos, textos e imágenes para vender" },
    { id: "reportes", icono: "📈", titulo: "Reportes", desc: "Análisis y exportación CSV" },
    { id: "respaldo", icono: "💾", titulo: "Respaldo", desc: "Copia y restauración de datos" },
    { id: "configuracion", icono: "⚙️", titulo: "Configuración", desc: "Ajustes generales" }
  ];

  const UI = { MODULOS, vistas: {}, actual: "inicio", $, esc };

  /* ---------- Mensajes ---------- */
  let temporizador;
  UI.mensaje = function (texto, tipo) {
    const caja = $("mensajeGeneral");
    if (!caja) return;
    caja.textContent = texto;
    caja.className = "message" + (tipo === "error" ? " error" : tipo === "info" ? " info" : "");
    caja.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { caja.hidden = true; }, tipo === "error" ? 9000 : 5000);
  };
  /* Indicador de "guardando…": bloquea la pantalla mientras hay operaciones en curso (evita dobles clics) */
  let ocupadas = 0;
  UI.ocupado = function (sube) {
    ocupadas = Math.max(0, ocupadas + (sube ? 1 : -1));
    document.body.classList.toggle("cargando", ocupadas > 0);
  };
  /**
   * Ejecuta una acción y muestra su resultado. Si la acción es asíncrona (llama a la nube) devuelve una promesa:
   * úsala con await. Los errores de negocio se muestran sin romper la pantalla.
   */
  UI.intentar = function (accion, textoOk) {
    const falla = (e) => {
      if (e instanceof ErrorNegocio) UI.mensaje(e.message, "error");
      else { console.error(e); UI.mensaje("Ocurrió un error inesperado: " + (e && e.message ? e.message : e), "error"); }
      return { ok: false, error: e };
    };
    let r;
    try { r = accion(); } catch (e) { return falla(e); }
    if (r && typeof r.then === "function") {
      UI.ocupado(true);
      return r.then((v) => { if (textoOk) UI.mensaje(textoOk); return { ok: true, valor: v }; }, falla).finally(() => UI.ocupado(false));
    }
    if (textoOk) UI.mensaje(textoOk);
    return { ok: true, valor: r };
  };

  /* ---------- Diálogos ---------- */
  function dialogo(html, { ancho } = {}) {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg" + (ancho ? " dlg-" + ancho : "");
    dlg.innerHTML = html;
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    return dlg;
  }
  UI.dialogo = dialogo;
  UI.confirmar = function (texto, { titulo = "Confirmar", ok = "Aceptar", peligro = false } = {}) {
    return new Promise((resolver) => {
      const dlg = dialogo(`<h3>${esc(titulo)}</h3><p class="dlg-texto">${esc(texto)}</p>
        <div class="form-actions"><button class="btn ${peligro ? "btn-danger" : "btn-primary"}" data-r="1">${esc(ok)}</button><button class="btn btn-light" data-r="0">Cancelar</button></div>`);
      let valor = false;
      dlg.addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (b) { valor = b.dataset.r === "1"; dlg.close(); } });
      dlg.addEventListener("close", () => resolver(valor));
    });
  };
  /** Pide un texto (por ejemplo, el motivo de una anulación). Devuelve null si se cancela. */
  UI.pedirTexto = function (titulo, etiqueta, { obligatorio = true, ok = "Aceptar", peligro = false, exacto } = {}) {
    return new Promise((resolver) => {
      const dlg = dialogo(`<h3>${esc(titulo)}</h3><form class="form-grid1"><label>${esc(etiqueta)}<input id="dlgTexto" maxlength="300" ${obligatorio ? "required" : ""} autocomplete="off"></label>
        <div class="form-actions"><button class="btn ${peligro ? "btn-danger" : "btn-primary"}" type="submit">${esc(ok)}</button><button class="btn btn-light" type="button" data-c="1">Cancelar</button></div></form>`);
      let valor = null;
      dlg.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        const t = dlg.querySelector("#dlgTexto").value.trim();
        if (obligatorio && !t) return;
        if (exacto && t !== exacto) { dlg.querySelector("#dlgTexto").setCustomValidity(`Escribe exactamente: ${exacto}`); dlg.querySelector("#dlgTexto").reportValidity(); return; }
        valor = t; dlg.close();
      });
      dlg.querySelector("#dlgTexto").addEventListener("input", (e) => e.target.setCustomValidity(""));
      dlg.querySelector("[data-c]").addEventListener("click", () => dlg.close());
      dlg.addEventListener("close", () => resolver(valor));
      dlg.querySelector("#dlgTexto").focus();
    });
  };
  UI.informacion = function (titulo, html, { ancho } = {}) {
    const dlg = dialogo(`<h3>${esc(titulo)}</h3><div class="dlg-cuerpo">${html}</div><div class="form-actions"><button class="btn btn-light" data-x="1">Cerrar</button></div>`, { ancho });
    dlg.addEventListener("click", (e) => { if (e.target.closest("[data-x]")) dlg.close(); });
    return dlg;
  };

  /* ---------- Piezas de HTML ---------- */
  UI.tabla = function (columnas, filas, vacio) {
    if (!filas.length) return `<p class="empty-state">${esc(vacio || "No hay registros para mostrar.")}</p>`;
    const cab = columnas.map((c) => `<th>${esc(c.t)}</th>`).join("");
    const cuerpo = filas.map((f) => `<tr>${columnas.map((c) => `<td${c.cls ? ` class="${c.cls}"` : ""}>${c.f(f)}</td>`).join("")}</tr>`).join("");
    return `<div class="table-wrap"><table><thead><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody></table></div>`;
  };
  UI.pastilla = (texto, tipo) => `<span class="status-pill ${tipo || ""}">${esc(texto)}</span>`;
  UI.stat = (titulo, valor, nota) => `<article class="stat-card"><span>${esc(titulo)}</span><strong>${esc(valor)}</strong>${nota ? `<small>${esc(nota)}</small>` : ""}</article>`;
  UI.opciones = (lista, seleccionado, vacio) => (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : "") + lista.map((o) => `<option value="${esc(o.v)}"${o.v === seleccionado ? " selected" : ""}>${esc(o.t)}</option>`).join("");
  UI.encabezado = (eyebrow, titulo, texto) => `<div class="section-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(titulo)}</h2><p>${esc(texto)}</p></div>
    <button class="btn btn-light btn-small" data-ir="inicio" type="button">← Volver al inicio</button></div>`;
  UI.barras = function (grafico) {
    if (!grafico || !grafico.items.length) return "";
    const max = Math.max(...grafico.items.map((i) => i.valor), 1);
    return `<div class="bars"><h4>${esc(grafico.titulo)}</h4>${grafico.items.map((i) => `<div class="bar-row"><span class="bar-label" title="${esc(i.etiqueta)}">${esc(i.etiqueta)}</span><div class="bar-track"><div class="bar-fill${i.negativo ? " neg" : ""}" style="width:${Math.max(2, Math.round((i.valor / max) * 100))}%"></div></div><span class="bar-val">${esc(i.texto)}</span></div>`).join("")}</div>`;
  };
  UI.formatoCelda = (valor, tipo) => {
    if (tipo === "dinero") return U.dinero(valor);
    if (tipo === "fecha") return U.fecha(valor);
    if (tipo === "entero") return valor === "" || valor == null ? "—" : String(valor);
    return esc(valor ?? "");
  };

  /* ---------- Descargas ---------- */
  UI.descargar = function (nombre, contenido, tipo, bom) {
    const blob = new Blob(bom ? ["\ufeff", contenido] : [contenido], { type: tipo || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ---------- Editor de líneas (ventas, pedidos y compras) ---------- */
  /**
   * modo "precio": usa el precio del producto (ventas y pedidos). modo "costo": el costo es editable (compras).
   * Con la barra de búsqueda se puede teclear o escanear un SKU/código de barras y pulsar Enter para agregarlo.
   */
  UI.LineasEditor = function (contenedor, { modo, alCambiar, mostrarStock }) {
    const st = { items: [] };
    contenedor.innerHTML = `<div class="line-add">
        <input type="search" class="le-buscar" placeholder="Buscar por nombre, SKU o código y pulsa Enter…" aria-label="Buscar producto">
        <select class="le-producto" aria-label="Producto"></select>
        <input type="number" class="le-cantidad" min="1" step="1" value="1" aria-label="Cantidad">
        <button type="button" class="btn btn-light le-agregar">Agregar</button></div>
      <div class="le-tabla"></div>`;
    const buscar = contenedor.querySelector(".le-buscar"), sel = contenedor.querySelector(".le-producto"), cant = contenedor.querySelector(".le-cantidad");
    const fabrica = () => Store.leer();
    function llenarSelect() {
      const d = fabrica();
      const lista = global.MINY.Dominio.buscarProductos(d, buscar.value, { soloActivos: true });
      const prev = sel.value;
      sel.innerHTML = `<option value="">Selecciona un producto (${lista.length})</option>` + lista.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)} · ${esc(p.codigo)} · disp. ${p.cantidad}</option>`).join("");
      if (lista.some((p) => p.id === prev)) sel.value = prev;
      return lista;
    }
    function agregar(p, cantidad) {
      const n = Number(cantidad);
      if (!Number.isInteger(n) || n < 1) return UI.mensaje("La cantidad debe ser un entero mayor que cero.", "error");
      const ya = st.items.find((x) => x.productoId === p.id);
      if (ya) ya.cantidad += n;
      else st.items.push({ productoId: p.id, nombre: p.nombre, codigo: p.codigo, cantidad: n, unit: modo === "costo" ? p.costo : p.precio });
      cant.value = "1"; render(); alCambiar && alCambiar();
    }
    function render() {
      const d = fabrica();
      const filas = st.items.map((it, i) => {
        const p = global.MINY.Dominio.productoDe(d, it.productoId);
        const stock = p ? p.cantidad : 0;
        const alerta = mostrarStock && it.cantidad > stock;
        return `<tr class="${alerta ? "fila-alerta" : ""}"><td><strong>${esc(it.nombre)}</strong><br><small>${esc(it.codigo)}</small></td>
          ${mostrarStock ? `<td>${stock}${alerta ? ' <span class="status-pill low">Insuficiente</span>' : ""}</td>` : ""}
          <td><input type="number" class="le-qty" data-i="${i}" min="1" step="1" value="${it.cantidad}" aria-label="Cantidad"></td>
          <td>${modo === "costo" ? `<input type="number" class="le-unit" data-i="${i}" min="0" step="1" value="${it.unit}" aria-label="Costo unitario">` : U.dinero(it.unit)}</td>
          <td class="num">${U.dinero(it.unit * it.cantidad)}</td>
          <td><button type="button" class="table-action danger" data-quitar="${i}" aria-label="Quitar">Quitar</button></td></tr>`;
      }).join("");
      contenedor.querySelector(".le-tabla").innerHTML = st.items.length
        ? `<div class="table-wrap"><table class="tabla-lineas"><thead><tr><th>Producto</th>${mostrarStock ? "<th>Disponibles</th>" : ""}<th>Cantidad</th><th>${modo === "costo" ? "Costo unitario" : "Precio unitario"}</th><th>Subtotal</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`
        : '<p class="empty-state">Aún no has agregado productos.</p>';
    }
    buscar.addEventListener("input", llenarSelect);
    buscar.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const lista = llenarSelect();
      const q = U.normalizar(buscar.value);
      const exacto = lista.find((p) => U.normalizar(p.codigo) === q || (p.barras && U.normalizar(p.barras) === q));
      const p = exacto || (lista.length === 1 ? lista[0] : null);
      if (p) { agregar(p, cant.value); buscar.value = ""; llenarSelect(); buscar.focus(); }
      else if (!lista.length) UI.mensaje("No se encontró ningún producto activo con ese dato.", "error");
      else UI.mensaje("Hay varios resultados: elige uno en la lista y pulsa Agregar.", "info");
    });
    contenedor.querySelector(".le-agregar").addEventListener("click", () => {
      const p = global.MINY.Dominio.productoDe(fabrica(), sel.value);
      if (!p) return UI.mensaje("Selecciona un producto.", "error");
      agregar(p, cant.value);
    });
    contenedor.addEventListener("input", (e) => {
      const q = e.target.closest(".le-qty"), u = e.target.closest(".le-unit");
      if (q) { const it = st.items[+q.dataset.i]; it.cantidad = Math.max(0, Math.floor(Number(q.value) || 0)); }
      if (u) { const it = st.items[+u.dataset.i]; it.unit = Math.max(0, Math.floor(Number(u.value) || 0)); }
      if (q || u) { actualizarSubtotales(); alCambiar && alCambiar(); }
    });
    function actualizarSubtotales() {
      contenedor.querySelectorAll(".tabla-lineas tbody tr").forEach((tr, i) => { const it = st.items[i]; if (it) tr.querySelector(".num").textContent = U.dinero(it.unit * it.cantidad); });
    }
    contenedor.addEventListener("click", (e) => {
      const b = e.target.closest("[data-quitar]");
      if (b) { st.items.splice(+b.dataset.quitar, 1); render(); alCambiar && alCambiar(); }
    });
    const api = {
      items: () => st.items.map((it) => ({ productoId: it.productoId, cantidad: it.cantidad, [modo === "costo" ? "costoUnitario" : "precioUnitario"]: it.unit })),
      conLineas: () => st.items,
      subtotal: () => st.items.reduce((s, it) => s + it.unit * it.cantidad, 0),
      establecer(items) { st.items = items.map((it) => ({ productoId: it.productoId, nombre: it.nombre, codigo: it.codigo, cantidad: it.cantidad, unit: modo === "costo" ? it.costoUnitario : it.precioUnitario })); render(); alCambiar && alCambiar(); },
      limpiar() { st.items = []; buscar.value = ""; render(); llenarSelect(); alCambiar && alCambiar(); },
      refrescar() { llenarSelect(); render(); }
    };
    llenarSelect(); render();
    return api;
  };

  /* ---------- Navegación ---------- */
  UI.mostrar = async function (id, forzar) {
    if (!UI.vistas[id]) id = "inicio";
    const nube = global.MINY.Nube;
    if (nube && nube.sb && (forzar || nube.necesitaRefresco(20))) {
      UI.ocupado(true);
      try { await nube.refrescar(); } catch (e) { UI.mensaje(e.message || "No se pudieron actualizar los datos.", "error"); } finally { UI.ocupado(false); }
    }
    UI.actual = id;
    document.querySelectorAll(".seccion").forEach((s) => { s.hidden = s.id !== "seccion-" + id; });
    document.querySelectorAll("[data-seccion]").forEach((b) => { const act = b.dataset.seccion === id; b.classList.toggle("active", act); if (act) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    try { UI.vistas[id].actualizar(); } catch (e) { console.error(e); UI.mensaje("No se pudo mostrar el módulo: " + e.message, "error"); }
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    const nav = document.querySelector(".nav-btn.active");
    if (nav && nav.scrollIntoView) nav.scrollIntoView({ block: "nearest", inline: "center" });
    window.scrollTo(0, 0);
  };
  UI.refrescar = function () { if (UI.vistas[UI.actual]) UI.vistas[UI.actual].actualizar(); };

  global.MINY.UI = UI;
})(window);
