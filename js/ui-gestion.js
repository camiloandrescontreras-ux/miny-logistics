"use strict";
/* MINY Logistics · Pantallas: Finanzas (9), Reportes (10), Respaldo (11) y Configuración (12) */
(function (global) {
  const { U, Store, KEYS, ErrorNegocio } = global.MINY;
  const UI = global.MINY.UI;
  const Dom = () => global.MINY.Dominio;
  const { $, esc } = UI;

  /* ================= MÓDULO 9 · FINANZAS ================= */
  const ORIGEN_TXT = { venta: "Venta", cobro: "Cobro de venta", compra: "Compra recibida", manual: "Manual" };
  UI.vistas.finanzas = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("MOVIMIENTO DE DINERO", "Finanzas", "Registro sencillo de ingresos y gastos del negocio.")}
        <div class="aviso aviso-info"><strong>Cómo se evita contar dos veces:</strong> el dinero cobrado de las ventas (Ventas y Cobros) y la mercancía recibida (Compras) se suman automáticamente; lo que un cliente aún te debe NO es ingreso hasta que se cobra. Aquí solo registra ingresos y gastos <em>adicionales</em> (arriendo, servicios, nómina…). El resultado es un <strong>cálculo a partir de los registros</strong>, no el saldo de ninguna cuenta bancaria ni de caja.</div>
        <div class="panel"><h3 id="finTitulo">Registrar movimiento manual</h3>
          <form id="finForm" class="form-grid" novalidate><input id="finId" type="hidden">
            <label>Tipo *<select id="finTipo"><option value="egreso">Gasto</option><option value="ingreso">Ingreso</option></select></label>
            <label>Concepto *<input id="finConcepto" required maxlength="140" placeholder="Ej. Arriendo del local"></label>
            <label>Importe (COP) *<input id="finValor" type="number" min="1" step="1" required></label>
            <label>Fecha *<input id="finFecha" type="date" required></label>
            <label>Categoría<select id="finCategoria"></select></label>
            <label>Método de pago (opcional)<select id="finPago"></select></label>
            <label class="full-width">Observaciones<input id="finObs" maxlength="300"></label>
            <div class="form-actions full-width"><button id="finGuardar" class="btn btn-primary" type="submit">Guardar movimiento</button><button id="finCancelar" class="btn btn-light" type="button" hidden>Cancelar edición</button></div>
          </form></div>
        <div class="panel"><div class="panel-heading"><h3>Consulta</h3></div>
          <div class="filters-bar"><label class="inline-field">Desde<input id="finDesde" type="date"></label><label class="inline-field">Hasta<input id="finHasta" type="date"></label>
            <select id="finFTipo" aria-label="Tipo"><option value="">Ingresos y gastos</option><option value="ingreso">Solo ingresos</option><option value="egreso">Solo gastos</option></select>
            <select id="finFCategoria" aria-label="Categoría"></select>
            <select id="finFOrigen" aria-label="Origen"><option value="">Todos los orígenes</option><option value="cobro">Cobros de ventas</option><option value="compra">Compras recibidas</option><option value="manual">Manuales</option></select></div>
          <div id="finStats" class="stats-grid stats-3"></div><div id="finMensual"></div></div>
        <div class="panel"><h3>Movimientos</h3><div id="finLista"></div></div>`;
      $("finFecha").value = U.hoy();
      $("finPago").innerHTML = UI.opciones(Dom().METODOS_PAGO.map((m) => ({ v: m, t: m })), "", "Sin indicar");
      $("finTipo").addEventListener("change", () => this.categorias());
      ["finDesde", "finHasta", "finFTipo", "finFCategoria", "finFOrigen"].forEach((id) => $(id).addEventListener("input", () => this.consulta()));
      $("finCancelar").addEventListener("click", () => this.limpiar());
      $("finForm").addEventListener("submit", (e) => { e.preventDefault(); this.guardar(); });
      $("finLista").addEventListener("click", (e) => this.accion(e));
      this.categorias();
      $("finFCategoria").innerHTML = UI.opciones(["Ventas cobradas", "Compras de mercancía", ...Dom().CATEGORIAS_INGRESO, ...Dom().CATEGORIAS_EGRESO].map((c) => ({ v: c, t: c })), "", "Todas las categorías");
    },
    categorias(sel) {
      const ingreso = $("finTipo").value === "ingreso";
      const lista = ingreso ? Dom().CATEGORIAS_INGRESO : Dom().CATEGORIAS_EGRESO;
      $("finCategoria").innerHTML = UI.opciones(lista.map((c) => ({ v: c, t: c })), sel || (ingreso ? "Otros ingresos" : "Otros gastos"));
    },
    limpiar() {
      $("finForm").reset(); $("finId").value = ""; $("finFecha").value = U.hoy(); $("finTitulo").textContent = "Registrar movimiento manual"; $("finGuardar").textContent = "Guardar movimiento"; $("finCancelar").hidden = true; this.categorias();
    },
    async guardar() {
      const edicion = !!$("finId").value;
      const r = await UI.intentar(() => Dom().guardarMovimientoFinanciero({ id: $("finId").value || null, tipo: $("finTipo").value, concepto: $("finConcepto").value, valor: $("finValor").value, fecha: $("finFecha").value, categoria: $("finCategoria").value, metodoPago: $("finPago").value, observaciones: $("finObs").value }), edicion ? "Movimiento corregido (queda el historial del cambio)." : "Movimiento financiero guardado.");
      if (r.ok) { this.limpiar(); this.actualizar(); }
    },
    actualizar() { this.consulta(); },
    consulta() {
      const d = Store.leer();
      const f = { desde: $("finDesde").value, hasta: $("finHasta").value, tipo: $("finFTipo").value, categoria: $("finFCategoria").value, origen: $("finFOrigen").value };
      const filas = Dom().libroFinanzas(d, f), r = Dom().resumenFinanzas(filas);
      const acum = Dom().resumenFinanzas(Dom().libroFinanzas(d, {}));
      $("finStats").innerHTML = UI.stat("Ingresos del filtro", U.dinero(r.ingresos)) + UI.stat("Gastos y compras del filtro", U.dinero(r.egresos)) + UI.stat("Resultado calculado", U.dinero(r.neto), `Acumulado total: ${U.dinero(acum.neto)}`);
      const meses = Dom().resumenMensual(filas);
      $("finMensual").innerHTML = UI.tabla([{ t: "Mes", f: (m) => esc(m.mes) }, { t: "Ingresos", f: (m) => U.dinero(m.ingresos) }, { t: "Gastos y compras", f: (m) => U.dinero(m.egresos) }, { t: "Resultado", f: (m) => `<strong class="${m.neto < 0 ? "neg" : "pos"}">${U.dinero(m.neto)}</strong>` }], meses, "Sin movimientos en este filtro.");
      $("finLista").innerHTML = UI.tabla([
        { t: "Fecha", f: (x) => esc(U.fecha(x.fecha)) }, { t: "Tipo", f: (x) => UI.pastilla(x.tipo === "ingreso" ? "Ingreso" : "Gasto", x.tipo === "ingreso" ? "done" : "cancelled") },
        { t: "Concepto", f: (x) => esc(x.concepto) }, { t: "Categoría", f: (x) => esc(x.categoria) }, { t: "Importe", f: (x) => `<strong>${U.dinero(x.valor)}</strong>` },
        { t: "Pago", f: (x) => esc(x.metodoPago || "—") }, { t: "Origen", f: (x) => esc(ORIGEN_TXT[x.origen]) },
        { t: "", f: (x) => x.editable ? `<button class="table-action" data-editar="${esc(x.id)}">Corregir</button><button class="table-action danger" data-anular="${esc(x.id)}">Anular</button>` : "<small>Se gestiona en su módulo</small>" }
      ], filas, "No hay movimientos financieros en este filtro.");
    },
    async accion(e) {
      const d = Store.leer();
      const ed = e.target.closest("[data-editar]"), an = e.target.closest("[data-anular]");
      if (ed) {
        const x = d.finanzas.find((r) => r.id === ed.dataset.editar); if (!x) return;
        $("finId").value = x.id; $("finTipo").value = x.tipo; this.categorias(x.categoria); $("finConcepto").value = x.concepto; $("finValor").value = x.valor; $("finFecha").value = x.fecha || U.hoy(); $("finPago").value = x.metodoPago || ""; $("finObs").value = x.observaciones || "";
        $("finTitulo").textContent = "Corregir movimiento"; $("finGuardar").textContent = "Guardar corrección"; $("finCancelar").hidden = false; $("finForm").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (an) {
        const motivo = await UI.pedirTexto("Anular movimiento", "Motivo de la anulación", { ok: "Anular", peligro: true }); if (motivo === null) return;
        if ((await UI.intentar(() => Dom().anularMovimientoFinanciero(an.dataset.anular, motivo), "Movimiento anulado (deja de sumar, pero queda registrado).")).ok) this.actualizar();
      }
    }
  };

  /* ================= MÓDULO 10 · REPORTES ================= */
  let ultimoReporte = null;
  UI.vistas.reportes = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("ANÁLISIS", "Reportes y estadísticas", "Calculados con tus registros reales. Exporta cualquier listado a CSV (se abre en Excel).")}
        <div class="panel"><div class="filters-bar">
          <label class="inline-field">Reporte<select id="repTipo">${Object.entries(global.MINY.Reportes.TIPOS_REPORTE).map(([k, v]) => `<option value="${k}">${esc(v.titulo)}</option>`).join("")}</select></label>
          <label class="inline-field f-fechas">Desde<input id="repDesde" type="date"></label><label class="inline-field f-fechas">Hasta<input id="repHasta" type="date"></label>
          <label class="inline-field f-productoId">Producto<select id="repProducto"></select></label>
          <label class="inline-field f-categoria">Categoría<select id="repCategoria"></select></label>
          <label class="inline-field f-clienteId">Cliente<select id="repCliente"></select></label>
          <label class="inline-field f-proveedorId">Proveedor<select id="repProveedor"></select></label>
          <button id="repCSV" class="btn btn-light" type="button">Exportar CSV</button></div></div>
        <div id="repResumen" class="stats-grid"></div><div id="repGrafico" class="panel" hidden></div><div class="panel"><h3 id="repTitulo"></h3><div id="repTabla"></div></div>`;
      ["repTipo", "repDesde", "repHasta", "repProducto", "repCategoria", "repCliente", "repProveedor"].forEach((id) => $(id).addEventListener("input", () => this.generar()));
      $("repTipo").addEventListener("input", () => this.filtrosVisibles());
      $("repCSV").addEventListener("click", () => this.exportar());
    },
    filtrosVisibles() {
      const usa = global.MINY.Reportes.TIPOS_REPORTE[$("repTipo").value].filtros;
      ["fechas", "productoId", "categoria", "clienteId", "proveedorId"].forEach((k) => document.querySelectorAll(".f-" + k).forEach((el) => { el.hidden = !usa.includes(k); }));
    },
    actualizar() {
      const d = Store.leer();
      const cats = [...new Set(d.productos.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
      const llenar = (id, lista, vacio) => { const v = $(id).value; $(id).innerHTML = UI.opciones(lista, v, vacio); };
      llenar("repProducto", d.productos.map((p) => ({ v: p.id, t: `${p.nombre} (${p.codigo})` })), "Todos");
      llenar("repCategoria", cats.map((c) => ({ v: c, t: c })), "Todas");
      llenar("repCliente", d.clientes.map((c) => ({ v: c.id, t: c.nombre })), "Todos");
      llenar("repProveedor", d.proveedores.map((p) => ({ v: p.id, t: p.nombre })), "Todos");
      this.filtrosVisibles(); this.generar();
    },
    generar() {
      const d = Store.leer();
      const tipo = $("repTipo").value;
      const usa = global.MINY.Reportes.TIPOS_REPORTE[tipo].filtros;
      const f = {};
      if (usa.includes("fechas")) { f.desde = $("repDesde").value; f.hasta = $("repHasta").value; }
      if (usa.includes("productoId")) f.productoId = $("repProducto").value;
      if (usa.includes("categoria")) f.categoria = $("repCategoria").value;
      if (usa.includes("clienteId")) f.clienteId = $("repCliente").value;
      if (usa.includes("proveedorId")) f.proveedorId = $("repProveedor").value;
      const R = global.MINY.Reportes.reporte(d, tipo, f);
      ultimoReporte = R;
      $("repTitulo").textContent = R.titulo;
      $("repResumen").innerHTML = R.resumen.map((r) => UI.stat(r.t, UI.formatoCelda(r.v, r.tipo).replace(/&amp;/g, "&"))).join("");
      const g = UI.barras(R.grafico);
      $("repGrafico").hidden = !g || R.vacio; $("repGrafico").innerHTML = g;
      $("repTabla").innerHTML = R.vacio ? '<p class="empty-state">No hay información para este período o filtro.</p>' : UI.tabla(R.columnas.map((c) => ({ t: c.t, f: (fila) => UI.formatoCelda(fila[c.k], c.tipo) })), R.filas.slice(0, 500)) + (R.filas.length > 500 ? `<p class="muted">Se muestran 500 de ${R.filas.length} filas; el CSV incluye todas.</p>` : "");
    },
    exportar() {
      if (!ultimoReporte || ultimoReporte.vacio) return UI.mensaje("No hay datos para exportar con este filtro.", "info");
      UI.descargar(`miny-${$("repTipo").value}-${U.hoy()}.csv`, global.MINY.Reportes.aCSV(ultimoReporte), "text/csv;charset=utf-8", true);
      UI.mensaje("CSV descargado.");
    }
  };

  /* ================= MÓDULO 11 · RESPALDO ================= */
  UI.vistas.respaldo = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("PROTEGE TU INFORMACIÓN", "Respaldo", "Tus datos están guardados en tu cuenta en la nube. Aquí puedes descargar una copia propia.")}
        <div class="aviso aviso-info"><strong>Dónde están tus datos:</strong> en la base de datos de Supabase, protegidos por tu usuario y contraseña: ya no dependen de este navegador y puedes verlos desde cualquier dispositivo iniciando sesión. Aun así conviene tener una copia propia: descárgala de vez en cuando y guárdala fuera de la aplicación (Drive, correo, USB).</div>
        <div class="panel"><h3>Descargar respaldo</h3><p>Genera un archivo JSON con productos (incluidos sus textos de marketing), movimientos de inventario, ventas y cobros, pedidos, clientes, proveedores, compras, finanzas y configuración. Las imágenes de los productos no se incluyen.</p>
          <p id="resUltimo" class="muted"></p><div class="button-row"><button id="resExportar" class="btn btn-primary" type="button">⬇️ Descargar respaldo JSON</button></div></div>
        <div class="panel"><h3>Restaurar desde un archivo</h3><p>La restauración desde archivo <strong>todavía no está disponible</strong> en la versión conectada. Si necesitas recuperar información, conserva tus respaldos y consúltalo antes de borrar nada en tu cuenta.</p></div>`;
      $("resExportar").addEventListener("click", () => this.exportar());
    },
    actualizar() {
      const d = Store.leer();
      $("resUltimo").textContent = d.config.ultimoRespaldo ? `Último respaldo descargado: ${U.fechaHora(d.config.ultimoRespaldo)}` : "Todavía no has descargado ningún respaldo.";
    },
    async exportar() {
      const r = await UI.intentar(async () => {
        const datos = await global.MINY.Nube.exportarRespaldo();
        UI.descargar(`respaldo-miny-${U.hoy()}.json`, JSON.stringify(datos, null, 2), "application/json");
      }, "Respaldo descargado. Guárdalo en un lugar seguro fuera de la aplicación.");
      if (r.ok) this.actualizar();
    }
  };

  /* ================= MÓDULO 12 · CONFIGURACIÓN ================= */
  UI.vistas.configuracion = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("AJUSTES", "Configuración y administración", "Ajustes generales de MINY Logistics.")}
        <div class="panel"><h3>Preferencias</h3>
          <form id="cfgForm" class="form-grid" novalidate>
            <label>Nombre comercial del negocio<input id="cfgNegocio" maxlength="80" placeholder="Ej. Tienda de Ana"></label>
            <label>Moneda<select id="cfgMoneda"></select></label>
            <label>Formato de fecha<select id="cfgFecha"></select></label>
            <label>Existencias mínimas por defecto<input id="cfgMinimo" type="number" min="0" step="1"></label>
            <label class="check span2"><input id="cfgDescuentos" type="checkbox"> Permitir descuentos en las ventas</label>
            <p class="muted full-width">El nombre comercial se muestra junto a la marca MINY Logistics y en los comprobantes; no reemplaza el nombre del producto. Los importes se manejan en unidades enteras (sin centavos).</p>
            <div class="form-actions full-width"><button class="btn btn-primary" type="submit">Guardar configuración</button></div></form></div>
        <div class="panel"><h3>Información de la aplicación</h3><div id="cfgInfo"></div></div>
        <div class="panel"><h3>Respaldo</h3><p>Descarga una copia de tus datos desde el módulo de respaldo.</p><button class="btn btn-light" data-ir="respaldo" type="button">Ir a Respaldo</button></div>
        <div class="panel zona-peligro"><h3>Zona de cuidado</h3>
          <p>Restablece los ajustes (nombre, moneda, formato de fecha, mínimo por defecto, descuentos y contacto de marketing). Tus productos, ventas y demás datos no se modifican.</p>
          <div class="button-row"><button id="cfgRestablecer" class="btn btn-danger-outline" type="button">Restablecer configuración</button></div></div>`;
      $("cfgMoneda").innerHTML = UI.opciones(global.MINY.MONEDAS.map((m) => ({ v: m, t: m + (m === "COP" ? " (peso colombiano)" : "") })), "COP");
      $("cfgFecha").innerHTML = UI.opciones(global.MINY.FORMATOS_FECHA.map((m) => ({ v: m, t: m })), "dd/mm/aaaa");
      $("cfgForm").addEventListener("submit", (e) => { e.preventDefault(); this.guardar(); });
      $("cfgRestablecer").addEventListener("click", () => this.restablecer());
    },
    actualizar() {
      const d = Store.leer(), c = d.config;
      $("cfgNegocio").value = c.negocio; $("cfgMoneda").value = c.moneda; $("cfgFecha").value = c.formatoFecha; $("cfgMinimo").value = c.minimoDefecto; $("cfgDescuentos").checked = !!c.permitirDescuentos;
      const nube = global.MINY.Nube;
      $("cfgInfo").innerHTML = `<dl class="detalle"><dt>Versión de la aplicación</dt><dd>${esc(global.MINY.VERSION_APP)} (conectada a la nube)</dd>
        <dt>Cuenta</dt><dd>${esc((nube.usuario && nube.usuario.email) || "—")}</dd>
        <dt>Almacenamiento</dt><dd>Base de datos y archivos en <strong>Supabase</strong>, aislados por usuario. Los datos ya no dependen de este navegador.</dd>
        <dt>Modo de uso</dt><dd>Cada cuenta tiene <strong>su propio negocio</strong> y no ve los datos de otras cuentas. Por ahora un negocio lo usa un solo usuario (no hay invitación de empleados ni roles en pantalla).</dd></dl>`;
    },
    async guardar() {
      const r = await UI.intentar(() => Dom().guardarConfig({ negocio: $("cfgNegocio").value, moneda: $("cfgMoneda").value, formatoFecha: $("cfgFecha").value, minimoDefecto: $("cfgMinimo").value, permitirDescuentos: $("cfgDescuentos").checked }), "Configuración guardada.");
      if (r.ok) global.MINY.App.refrescarTodo();
    },
    async restablecer() {
      if (!(await UI.confirmar("Se restablecerán los ajustes (nombre del negocio, moneda, formato de fecha, mínimo por defecto y descuentos). Tus productos, ventas y demás datos NO se modifican.", { titulo: "Restablecer configuración", ok: "Restablecer", peligro: true }))) return;
      if ((await UI.intentar(() => Dom().restablecerConfig(), "Configuración restablecida.")).ok) global.MINY.App.refrescarTodo();
    }
  };
})(window);
