"use strict";
/* MINY Logistics · Pantallas: Inicio (1), Productos (2) e Inventario (3) */
(function (global) {
  const { U, Store } = global.MINY;
  const UI = global.MINY.UI;
  const Dom = () => global.MINY.Dominio;
  const { $, esc } = UI;

  /* ================= MÓDULO 1 · INICIO ================= */
  UI.vistas.inicio = {
    montar(sec) {
      sec.innerHTML = `<div class="section-heading"><div><p class="eyebrow">RESUMEN</p><h2>Panel principal</h2><p>Indicadores calculados con tus registros reales.</p></div>
        <label class="inline-field">Período
          <select id="inicioPeriodo"><option value="mes">Este mes</option><option value="hoy">Hoy</option><option value="7d">Últimos 7 días</option><option value="30d">Últimos 30 días</option><option value="anio">Este año</option><option value="todo">Todo el historial</option></select></label></div>
        <div id="inicioAvisoVacio"></div>
        <div id="inicioStats" class="stats-grid"></div>
        <div class="two-col"><div class="panel"><h3>⚠️ Alertas</h3><div id="inicioAlertas"></div></div>
        <div class="panel"><h3>🕒 Actividad reciente</h3><div id="inicioActividad"></div></div></div>
        <h3 class="subtitulo">Accesos directos</h3><div id="inicioAccesos" class="tiles"></div>`;
      $("inicioPeriodo").addEventListener("change", () => this.actualizar());
      $("inicioAccesos").innerHTML = UI.MODULOS.map((m) => `<button type="button" class="tile" data-ir="${m.id}"><span class="tile-ico" aria-hidden="true">${m.icono}</span><strong>${esc(m.titulo)}</strong><small>${esc(m.desc)}</small></button>`).join("");
    },
    actualizar() {
      const d = Store.leer();
      const r = global.MINY.Reportes.resumenInicio(d, $("inicioPeriodo").value);
      const rango = r.periodo.desde ? `${U.fecha(r.periodo.desde)} – ${U.fecha(r.periodo.hasta)}` : "todo el historial";
      $("inicioAvisoVacio").innerHTML = r.sinDatos ? `<div class="welcome-card"><h3>Bienvenido a MINY Logistics</h3><p>Aún no hay datos registrados, por eso los indicadores están en cero. Empieza creando tus <a href="#productos" data-ir="productos">productos</a>, luego registra entradas de inventario, clientes y ventas.</p></div>` : "";
      $("inicioStats").innerHTML = [
        UI.stat("Productos registrados", String(r.productosTotal), `${r.productosActivos} activos`),
        UI.stat("Unidades en existencia", String(r.unidades)),
        UI.stat("Valor del inventario (a costo)", U.dinero(r.valorCosto), "existencias × costo unitario"),
        UI.stat("Valor del inventario (a precio de venta)", U.dinero(r.valorVenta), "existencias × precio de venta"),
        UI.stat("Ventas del período", U.dinero(r.ventasTotal), `${r.ventasCantidad} venta(s) · ${rango}`),
        UI.stat("Pedidos pendientes", String(r.pedidosPendientes), "pendientes o confirmados"),
        UI.stat("Pedidos en proceso", String(r.pedidosEnProceso), "en preparación o listos"),
        UI.stat("Compras por recibir", String(r.comprasPendientes)),
        UI.stat("Cartera por cobrar", U.dinero(r.cartera.total), r.cartera.vencidas ? `${r.cartera.vencidas} venta(s) vencida(s): ${U.dinero(r.cartera.vencido)}` : `${r.cartera.cantidad} venta(s) con saldo`),
        UI.stat("Ingresos del período", U.dinero(r.ingresos), "cobros de ventas + ingresos manuales"),
        UI.stat("Gastos del período", U.dinero(r.egresos), "compras recibidas + gastos manuales"),
        UI.stat("Resultado calculado", U.dinero(r.neto), "ingresos − gastos (no es saldo bancario)")
      ].join("");
      const alertas = [];
      r.agotados.slice(0, 5).forEach((p) => alertas.push(`<li>${UI.pastilla("Agotado", "cancelled")} ${esc(p.nombre)} <small>(${esc(p.codigo)})</small></li>`));
      r.bajos.slice(0, 5).forEach((p) => alertas.push(`<li>${UI.pastilla("Bajo", "low")} ${esc(p.nombre)}: ${p.cantidad} (mínimo ${p.minimo})</li>`));
      const extra = r.agotados.length + r.bajos.length - Math.min(5, r.agotados.length) - Math.min(5, r.bajos.length);
      if (extra > 0) alertas.push(`<li class="muted">… y ${extra} producto(s) más. Revisa el módulo Inventario.</li>`);
      if (r.pedidosPendientes) alertas.push(`<li>${UI.pastilla("Pedidos", "pending")} ${r.pedidosPendientes} pedido(s) por confirmar o iniciar.</li>`);
      if (r.cartera.vencidas) alertas.push(`<li>${UI.pastilla("Cartera", "cancelled")} ${r.cartera.vencidas} venta(s) con pago vencido por ${U.dinero(r.cartera.vencido)}. <a href="#cobros" data-ir="cobros">Ver cobros</a></li>`);
      if (r.comprasPendientes) alertas.push(`<li>${UI.pastilla("Compras", "pending")} ${r.comprasPendientes} compra(s) esperando recepción.</li>`);
      $("inicioAlertas").innerHTML = alertas.length ? `<ul class="lista-simple">${alertas.join("")}</ul>` : '<p class="empty-state">Sin alertas por ahora.</p>';
      $("inicioActividad").innerHTML = r.actividad.length ? `<ul class="lista-simple">${r.actividad.map((a) => `<li>${esc(a.texto)}${a.ts ? ` <small class="muted">${esc(U.fechaHora(a.ts))}</small>` : ""}</li>`).join("")}</ul>` : '<p class="empty-state">Todavía no hay actividad.</p>';
    }
  };

  /* ================= MÓDULO 2 · PRODUCTOS ================= */
  let provSel = new Set();
  UI.vistas.productos = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("CATÁLOGO", "Productos", "Catálogo central: todos los demás módulos usan estos productos.")}
        <div class="panel"><h3 id="prodTitulo">Registrar producto</h3>
          <form id="prodForm" class="form-grid" novalidate>
            <input id="prodId" type="hidden">
            <label>Nombre *<input id="prodNombre" required maxlength="120" placeholder="Ej. Llavero de anime"></label>
            <label>SKU / código interno<input id="prodSku" maxlength="60" placeholder="Si lo dejas vacío se genera (MIN-0001)"></label>
            <label>Código de barras (opcional)<input id="prodBarras" maxlength="60" inputmode="numeric" placeholder="Escanéalo o escríbelo"></label>
            <label>Categoría<input id="prodCategoria" maxlength="80" list="prodCategorias" placeholder="Ej. Accesorios"><datalist id="prodCategorias"></datalist></label>
            <label>Unidad de medida<select id="prodUnidad"></select></label>
            <label>Nivel mínimo de existencias<input id="prodMinimo" type="number" min="0" step="1" placeholder="Para alertas"></label>
            <label>Costo unitario (COP) *<input id="prodCosto" type="number" min="0" step="1" required placeholder="0"></label>
            <label>Precio de venta (COP) *<input id="prodPrecio" type="number" min="0" step="1" required placeholder="0"></label>
            <label id="prodCantWrap">Existencias iniciales<input id="prodCantidad" type="number" min="0" step="1" value="0"></label>
            <label class="full-width">Descripción<textarea id="prodDescripcion" maxlength="500" rows="2" placeholder="Opcional"></textarea></label>
            <div class="full-width"><span class="lbl">Proveedores de este producto (opcional)</span><div id="prodProveedores" class="checks"></div></div>
            <p id="prodMargen" class="calculation full-width">Margen bruto estimado: ingresa costo y precio.</p>
            <p id="prodNotaStock" class="muted full-width" hidden>Las existencias no se editan aquí: usa Inventario (entradas, salidas o ajustes) para que quede el historial.</p>
            <div class="form-actions full-width"><button id="prodGuardar" class="btn btn-primary" type="submit">Guardar producto</button><button id="prodCancelar" class="btn btn-light" type="button" hidden>Cancelar edición</button></div>
          </form></div>
        <div class="panel"><div class="panel-heading"><h3>Listado de productos</h3></div>
          <div class="filters-bar"><input id="prodBuscar" type="search" placeholder="Buscar por nombre, SKU, código o categoría…" aria-label="Buscar productos">
            <select id="prodFiltroCat" aria-label="Categoría"></select>
            <select id="prodFiltroEstado" aria-label="Estado"><option value="">Todos los estados</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select>
            <select id="prodOrden" aria-label="Ordenar"><option value="nombre">Ordenar: nombre A-Z</option><option value="sku">SKU</option><option value="stock_asc">Existencias (menor primero)</option><option value="stock_desc">Existencias (mayor primero)</option><option value="precio_desc">Precio (mayor primero)</option><option value="margen_desc">Margen (mayor primero)</option></select></div>
          <div id="prodLista"></div></div>`;
      $("prodUnidad").innerHTML = UI.opciones(Dom().UNIDADES.map((u) => ({ v: u, t: u })), "unidad");
      ["prodCosto", "prodPrecio"].forEach((id) => $(id).addEventListener("input", () => this.margenForm()));
      ["prodBuscar", "prodFiltroCat", "prodFiltroEstado", "prodOrden"].forEach((id) => $(id).addEventListener("input", () => this.lista()));
      $("prodProveedores").addEventListener("change", (e) => { const c = e.target.closest("input[type=checkbox]"); if (c) { c.checked ? provSel.add(c.value) : provSel.delete(c.value); } });
      $("prodCancelar").addEventListener("click", () => this.limpiar());
      $("prodForm").addEventListener("submit", (e) => { e.preventDefault(); this.guardar(); });
      $("prodLista").addEventListener("click", (e) => this.accion(e));
    },
    margenForm() {
      const c = Number($("prodCosto").value), p = Number($("prodPrecio").value);
      const m = Dom().margen({ costo: c, precio: p });
      $("prodMargen").textContent = m ? `Margen bruto estimado por unidad: ${U.dinero(m.valor)} (${m.porcentaje.toFixed(1)} % del precio)` : "Margen bruto estimado: ingresa un costo y un precio mayores que cero.";
    },
    limpiar() {
      $("prodForm").reset(); $("prodId").value = ""; provSel = new Set();
      $("prodTitulo").textContent = "Registrar producto"; $("prodGuardar").textContent = "Guardar producto";
      $("prodCancelar").hidden = true; $("prodCantWrap").hidden = false; $("prodNotaStock").hidden = true; $("prodCantidad").value = "0";
      this.margenForm(); this.formularioAuxiliar();
    },
    async guardar() {
      const datos = {
        id: $("prodId").value || null, nombre: $("prodNombre").value, codigo: $("prodSku").value, barras: $("prodBarras").value, categoria: $("prodCategoria").value,
        unidad: $("prodUnidad").value, minimo: $("prodMinimo").value, costo: $("prodCosto").value, precio: $("prodPrecio").value, cantidad: $("prodCantidad").value,
        descripcion: $("prodDescripcion").value, proveedorIds: [...provSel]
      };
      const edicion = !!datos.id;
      const r = await UI.intentar(() => Dom().guardarProducto(datos), edicion ? "Producto actualizado correctamente." : "Producto guardado correctamente.");
      if (r.ok) { this.limpiar(); this.actualizar(); }
    },
    formularioAuxiliar() {
      const d = Store.leer();
      const cats = [...new Set(d.productos.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
      $("prodCategorias").innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join("");
      const actual = $("prodFiltroCat").value;
      $("prodFiltroCat").innerHTML = UI.opciones(cats.map((c) => ({ v: c, t: c })), actual, "Todas las categorías");
      $("prodMinimo").placeholder = `Por defecto: ${d.config.minimoDefecto}`;
      $("prodProveedores").innerHTML = d.proveedores.filter((p) => p.activo !== false || provSel.has(p.id)).map((p) => `<label class="check"><input type="checkbox" value="${esc(p.id)}"${provSel.has(p.id) ? " checked" : ""}> ${esc(p.nombre)}</label>`).join("") || '<span class="muted">Aún no hay proveedores. Puedes crearlos en el módulo Proveedores.</span>';
    },
    actualizar() { this.formularioAuxiliar(); this.lista(); this.margenForm(); },
    lista() {
      const d = Store.leer();
      const q = $("prodBuscar").value, cat = $("prodFiltroCat").value, est = $("prodFiltroEstado").value, ord = $("prodOrden").value;
      let lista = d.productos.filter((p) => Dom().coincideProducto(p, q) && (!cat || p.categoria === cat) && (!est || (est === "activo") === (p.activo !== false)));
      const mg = (p) => { const m = Dom().margen(p); return m ? m.porcentaje : -1; };
      const orden = { nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"), sku: (a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }), stock_asc: (a, b) => a.cantidad - b.cantidad, stock_desc: (a, b) => b.cantidad - a.cantidad, precio_desc: (a, b) => b.precio - a.precio, margen_desc: (a, b) => mg(b) - mg(a) };
      lista = lista.slice().sort(orden[ord] || orden.nombre);
      const cols = [
        { t: "Producto", f: (p) => `<strong>${esc(p.nombre)}</strong>${p.descripcion ? `<br><small>${esc(p.descripcion.slice(0, 60))}</small>` : ""}` },
        { t: "SKU", f: (p) => esc(p.codigo) }, { t: "Código de barras", f: (p) => esc(p.barras || "—") }, { t: "Categoría", f: (p) => esc(p.categoria || "—") },
        { t: "Costo", f: (p) => U.dinero(p.costo) }, { t: "Precio", f: (p) => U.dinero(p.precio) },
        { t: "Margen / unidad", f: (p) => { const m = Dom().margen(p); return m ? `${U.dinero(m.valor)}<br><small>${m.porcentaje.toFixed(1)} %</small>` : "—"; } },
        { t: "Existencias", f: (p) => { const c = Dom().comprometido(d, p.id); const n = Dom().nivelStock(p); return `<strong>${p.cantidad}</strong> ${esc(p.unidad)} ${n === "agotado" ? UI.pastilla("Agotado", "cancelled") : n === "bajo" ? UI.pastilla("Bajo", "low") : ""}${c ? `<br><small>${c} comprometidas en pedidos</small>` : ""}`; } },
        { t: "Mín.", f: (p) => String(p.minimo) },
        { t: "Estado", f: (p) => UI.pastilla(p.activo === false ? "Inactivo" : "Activo", p.activo === false ? "cancelled" : "ok") },
        { t: "Acciones", f: (p) => `<button class="table-action" data-editar="${esc(p.id)}">Editar</button><button class="table-action" data-activar="${esc(p.id)}">${p.activo === false ? "Activar" : "Desactivar"}</button><button class="table-action danger" data-eliminar="${esc(p.id)}">Eliminar</button>` }
      ];
      $("prodLista").innerHTML = UI.tabla(cols, lista, d.productos.length ? "Ningún producto coincide con los filtros." : "Todavía no hay productos. Registra el primero con el formulario de arriba.");
    },
    async accion(e) {
      const ed = e.target.closest("[data-editar]"), ac = e.target.closest("[data-activar]"), el = e.target.closest("[data-eliminar]");
      const d = Store.leer();
      if (ed) {
        const p = Dom().productoDe(d, ed.dataset.editar); if (!p) return;
        $("prodId").value = p.id; $("prodNombre").value = p.nombre; $("prodSku").value = p.codigo; $("prodBarras").value = p.barras || ""; $("prodCategoria").value = p.categoria || "";
        $("prodUnidad").value = p.unidad || "unidad"; $("prodMinimo").value = p.minimo; $("prodCosto").value = p.costo; $("prodPrecio").value = p.precio; $("prodDescripcion").value = p.descripcion || "";
        provSel = new Set(p.proveedorIds || []); this.formularioAuxiliar();
        $("prodTitulo").textContent = "Editar producto"; $("prodGuardar").textContent = "Guardar cambios"; $("prodCancelar").hidden = false; $("prodCantWrap").hidden = true; $("prodNotaStock").hidden = false;
        this.margenForm(); $("prodForm").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (ac) {
        const p = Dom().productoDe(d, ac.dataset.activar); if (!p) return;
        const activar = p.activo === false;
        if (!activar && !(await UI.confirmar(`"${p.nombre}" dejará de aparecer en ventas, pedidos y compras, pero conservará su historial.`, { titulo: "Desactivar producto", ok: "Desactivar" }))) return;
        if ((await UI.intentar(() => Dom().cambiarActivoProducto(p.id, activar), activar ? "Producto activado." : "Producto desactivado.")).ok) this.lista();
      }
      if (el) {
        const p = Dom().productoDe(d, el.dataset.eliminar); if (!p) return;
        if (Dom().productoTieneHistorial(d, p.id)) return UI.mensaje("Este producto tiene historial (movimientos, ventas, pedidos o compras). No se puede eliminar; desactívalo para conservarlo.", "error");
        if (!(await UI.confirmar(`¿Eliminar definitivamente "${p.nombre}"? Esta acción no se puede deshacer.`, { titulo: "Eliminar producto", ok: "Eliminar", peligro: true }))) return;
        if ((await UI.intentar(() => Dom().eliminarProducto(p.id), "Producto eliminado.")).ok) { if (global.MINY.Fotos) global.MINY.Fotos.eliminarDeProducto(p.id); this.actualizar(); }
      }
    }
  };

  /* ================= MÓDULO 3 · INVENTARIO ================= */
  UI.vistas.inventario = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("CONTROL DE EXISTENCIAS", "Inventario", "Registra entradas, salidas y ajustes. Cada cambio queda en el historial.")}
        <div id="invAlertas"></div>
        <div class="panel"><h3>Registrar movimiento</h3>
          <form id="invForm" class="form-grid" novalidate>
            <label class="full-width">Buscar producto (nombre, SKU o código)<input id="invBuscarProd" type="search" placeholder="Escribe para filtrar la lista…"></label>
            <label>Producto *<select id="invProducto" required></select></label>
            <label>Tipo de movimiento *<select id="invTipo"><option value="entrada">Entrada de mercancía</option><option value="salida">Salida de mercancía</option><option value="ajuste_positivo">Ajuste positivo</option><option value="ajuste_negativo">Ajuste negativo</option></select></label>
            <label>Cantidad *<input id="invCantidad" type="number" min="1" step="1" required placeholder="Cantidad"></label>
            <label>Fecha<input id="invFecha" type="date"></label>
            <label>Documento de origen (opcional)<input id="invDocumento" maxlength="60" placeholder="Ej. Factura 123, compra, devolución"></label>
            <label>Observaciones <span id="invMotivoNota" class="muted">(obligatorias en ajustes)</span><input id="invNota" maxlength="300" placeholder="Motivo del movimiento"></label>
            <div class="form-actions full-width"><button class="btn btn-primary" type="submit">Registrar movimiento</button></div>
          </form>
          <p class="muted">Las ventas y las recepciones de compras generan sus movimientos automáticamente desde sus módulos.</p></div>
        <div class="panel"><div class="panel-heading"><h3>Existencias actuales</h3></div>
          <div class="filters-bar"><input id="invBuscar" type="search" placeholder="Buscar por nombre, SKU o código…" aria-label="Buscar en existencias">
            <select id="invNivel" aria-label="Nivel"><option value="">Todos los niveles</option><option value="agotado">Agotados</option><option value="bajo">Inventario bajo</option><option value="normal">Normales</option></select></div>
          <div id="invExistencias"></div></div>
        <div class="panel"><div class="panel-heading"><h3>Historial de movimientos</h3><button id="invCoherencia" class="btn btn-light btn-small" type="button">Verificar coherencia</button></div>
          <div class="filters-bar"><select id="invHProducto" aria-label="Producto"></select>
            <select id="invHTipo" aria-label="Tipo"></select>
            <label class="inline-field">Desde<input id="invHDesde" type="date"></label><label class="inline-field">Hasta<input id="invHHasta" type="date"></label></div>
          <div id="invHistorial"></div></div>`;
      $("invFecha").value = U.hoy();
      $("invHTipo").innerHTML = `<option value="">Todos los tipos</option>` + Object.entries(Dom().TIPOS_MOV).map(([k, v]) => `<option value="${k}">${esc(v.etiqueta)}</option>`).join("");
      $("invBuscarProd").addEventListener("input", () => this.selector());
      $("invTipo").addEventListener("change", () => { const aj = $("invTipo").value.startsWith("ajuste"); $("invNota").required = aj; });
      ["invBuscar", "invNivel"].forEach((id) => $(id).addEventListener("input", () => this.existencias()));
      ["invHProducto", "invHTipo", "invHDesde", "invHHasta"].forEach((id) => $(id).addEventListener("input", () => this.historial()));
      $("invForm").addEventListener("submit", (e) => { e.preventDefault(); this.registrar(); });
      $("invHistorial").addEventListener("click", (e) => this.revertir(e));
      $("invCoherencia").addEventListener("click", () => {
        const problemas = Dom().verificarCoherencia(Store.leer());
        if (!problemas.length) return UI.mensaje("Las existencias coinciden con la suma de los movimientos de todos los productos.");
        UI.informacion("Diferencias encontradas", `<p>Estos productos tienen existencias distintas a la suma de sus movimientos (puede venir de datos antiguos). Corrígelos con un ajuste documentado.</p>${UI.tabla([{ t: "Producto", f: (x) => esc(x.nombre) }, { t: "Existencias", f: (x) => x.existencias }, { t: "Suma de movimientos", f: (x) => x.sumaMovimientos }], problemas)}`);
      });
    },
    selector() {
      const d = Store.leer();
      const lista = Dom().buscarProductos(d, $("invBuscarProd").value, { soloActivos: true });
      const prev = $("invProducto").value;
      $("invProducto").innerHTML = `<option value="">Selecciona un producto</option>` + lista.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)} · ${esc(p.codigo)} · disp. ${p.cantidad}</option>`).join("");
      if (lista.some((p) => p.id === prev)) $("invProducto").value = prev;
    },
    async registrar() {
      const r = await UI.intentar(() => Dom().registrarMovimiento({ productoId: $("invProducto").value, tipo: $("invTipo").value, cantidad: $("invCantidad").value, fecha: $("invFecha").value, documento: $("invDocumento").value, nota: $("invNota").value }), "Movimiento de inventario registrado.");
      if (r.ok) { $("invCantidad").value = ""; $("invNota").value = ""; $("invDocumento").value = ""; this.actualizar(); }
    },
    actualizar() {
      this.selector();
      const d = Store.leer();
      const prev = $("invHProducto").value;
      $("invHProducto").innerHTML = UI.opciones(d.productos.map((p) => ({ v: p.id, t: `${p.nombre} (${p.codigo})` })), prev, "Todos los productos");
      const ag = d.productos.filter((p) => p.activo !== false && Dom().nivelStock(p) === "agotado"), bj = d.productos.filter((p) => p.activo !== false && Dom().nivelStock(p) === "bajo");
      $("invAlertas").innerHTML = (ag.length || bj.length) ? `<div class="aviso aviso-alerta"><strong>Alertas de inventario:</strong> ${ag.length} agotado(s)${ag.length ? " (" + esc(ag.slice(0, 4).map((p) => p.nombre).join(", ")) + (ag.length > 4 ? "…" : "") + ")" : ""} · ${bj.length} con existencias iguales o inferiores al mínimo${bj.length ? " (" + esc(bj.slice(0, 4).map((p) => p.nombre).join(", ")) + (bj.length > 4 ? "…" : "") + ")" : ""}.</div>` : "";
      this.existencias(); this.historial();
    },
    existencias() {
      const d = Store.leer();
      const q = $("invBuscar").value, nivel = $("invNivel").value;
      const lista = d.productos.filter((p) => Dom().coincideProducto(p, q) && (!nivel || Dom().nivelStock(p) === nivel));
      $("invExistencias").innerHTML = UI.tabla([
        { t: "Producto", f: (p) => `<strong>${esc(p.nombre)}</strong>${p.activo === false ? " " + UI.pastilla("Inactivo", "cancelled") : ""}` },
        { t: "SKU", f: (p) => esc(p.codigo) }, { t: "Categoría", f: (p) => esc(p.categoria || "—") },
        { t: "Existencias", f: (p) => `${p.cantidad} ${esc(p.unidad)}` }, { t: "Comprometidas (pedidos)", f: (p) => String(Dom().comprometido(d, p.id)) },
        { t: "Mínimo", f: (p) => String(p.minimo) }, { t: "Valor a costo", f: (p) => U.dinero(p.cantidad * p.costo) },
        { t: "Nivel", f: (p) => { const n = Dom().nivelStock(p); return UI.pastilla(n === "agotado" ? "Agotado" : n === "bajo" ? "Stock bajo" : "Disponible", n === "agotado" ? "cancelled" : n === "bajo" ? "low" : "ok"); } }
      ], lista, d.productos.length ? "Ningún producto coincide." : "No hay productos registrados.");
    },
    historial() {
      const d = Store.leer();
      const pid = $("invHProducto").value, tipo = $("invHTipo").value, desde = $("invHDesde").value, hasta = $("invHHasta").value;
      const lista = d.movimientos.filter((m) => (!pid || m.productoId === pid) && (!tipo || m.tipo === tipo) && Dom().enRango(m.fecha, { desde, hasta }));
      const mostrar = lista.slice(0, 200);
      $("invHistorial").innerHTML = UI.tabla([
        { t: "Fecha", f: (m) => esc(U.fecha(m.fecha)) },
        { t: "Producto", f: (m) => { const p = Dom().productoDe(d, m.productoId); return esc(p ? p.nombre : m.producto || "Producto eliminado"); } },
        { t: "SKU", f: (m) => { const p = Dom().productoDe(d, m.productoId); return esc(p ? p.codigo : m.codigo || "—"); } },
        { t: "Movimiento", f: (m) => esc((Dom().TIPOS_MOV[m.tipo] || {}).etiqueta || m.tipo) + (m.reversadoPor ? " " + UI.pastilla("Revertido", "pending") : "") },
        { t: "Cantidad", f: (m) => `<strong class="${m.delta < 0 ? "neg" : "pos"}">${m.delta > 0 ? "+" : ""}${m.delta}</strong>` },
        { t: "Antes", f: (m) => String(m.antes ?? "—") }, { t: "Después", f: (m) => String(m.despues ?? "—") },
        { t: "Documento", f: (m) => esc(m.origenNumero || "—") }, { t: "Observaciones", f: (m) => esc(m.nota || "—") },
        { t: "", f: (m) => ((Dom().TIPOS_MOV[m.tipo] || {}).manual && !m.reversadoPor && !m.revierteA) ? `<button class="table-action" data-revertir="${esc(m.id)}">Revertir</button>` : "" }
      ], mostrar, "No hay movimientos registrados con esos filtros.") + (lista.length > mostrar.length ? `<p class="muted">Mostrando los ${mostrar.length} más recientes de ${lista.length}. Usa los filtros o exporta el reporte de movimientos.</p>` : "");
    },
    async revertir(e) {
      const b = e.target.closest("[data-revertir]"); if (!b) return;
      const motivo = await UI.pedirTexto("Revertir movimiento", "Motivo de la reversión", { ok: "Revertir" });
      if (motivo === null) return;
      if ((await UI.intentar(() => Dom().revertirMovimiento(b.dataset.revertir, motivo), "Movimiento revertido con un movimiento contrario.")).ok) this.actualizar();
    }
  };
})(window);
