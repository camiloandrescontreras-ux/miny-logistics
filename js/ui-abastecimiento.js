"use strict";
/* MINY Logistics · Pantallas: Proveedores (7) y Compras (8) */
(function (global) {
  const { U, Store } = global.MINY;
  const UI = global.MINY.UI;
  const Dom = () => global.MINY.Dominio;
  const { $, esc } = UI;

  const opcionesProveedores = (d, sel, vacio) =>
    UI.opciones(d.proveedores.filter((p) => p.activo !== false || p.id === sel).map((p) => ({ v: p.id, t: p.nombre + (p.identificacion ? ` · ${p.identificacion}` : "") })), sel, vacio);

  /* ================= MÓDULO 7 · PROVEEDORES ================= */
  UI.vistas.proveedores = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("ABASTECIMIENTO", "Proveedores", "Registra a quienes te suministran mercancía. Desactivar no borra el historial.")}
        <div class="panel"><h3 id="proTitulo">Registrar proveedor</h3>
          <form id="proForm" class="form-grid" novalidate><input id="proId" type="hidden">
            <label>Nombre o razón social *<input id="proNombre" required maxlength="140"></label>
            <label>Identificación (opcional)<input id="proIdent" maxlength="40" placeholder="NIT o documento"></label>
            <label>Persona de contacto<input id="proContacto" maxlength="140"></label>
            <label>Teléfono<input id="proTelefono" maxlength="20" inputmode="tel"></label>
            <label>Correo electrónico<input id="proCorreo" type="email" maxlength="120"></label>
            <label>Dirección<input id="proDireccion" maxlength="200"></label>
            <label class="full-width">Observaciones<input id="proObs" maxlength="500"></label>
            <div class="form-actions full-width"><button id="proGuardar" class="btn btn-primary" type="submit">Guardar proveedor</button><button id="proCancelar" class="btn btn-light" type="button" hidden>Cancelar edición</button></div>
          </form></div>
        <div class="panel"><div class="panel-heading"><h3>Listado de proveedores</h3></div>
          <div class="filters-bar"><input id="proBuscar" type="search" placeholder="Buscar por nombre o identificación…" aria-label="Buscar proveedores">
            <select id="proEstado" aria-label="Estado"><option value="">Todos</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select></div>
          <div id="proLista"></div></div>`;
      ["proBuscar", "proEstado"].forEach((id) => $(id).addEventListener("input", () => this.lista()));
      $("proCancelar").addEventListener("click", () => this.limpiar());
      $("proForm").addEventListener("submit", (e) => { e.preventDefault(); this.guardar(false); });
      $("proLista").addEventListener("click", (e) => this.accion(e));
    },
    limpiar() { $("proForm").reset(); $("proId").value = ""; $("proTitulo").textContent = "Registrar proveedor"; $("proGuardar").textContent = "Guardar proveedor"; $("proCancelar").hidden = true; },
    async guardar(forzar) {
      const datos = { id: $("proId").value || null, nombre: $("proNombre").value, identificacion: $("proIdent").value, contacto: $("proContacto").value, telefono: $("proTelefono").value, correo: $("proCorreo").value, direccion: $("proDireccion").value, observaciones: $("proObs").value, forzar };
      UI.ocupado(true);
      try {
        const p = await Dom().guardarProveedor(datos);
        UI.mensaje(datos.id ? "Proveedor actualizado." : `Proveedor "${p.nombre}" guardado.`); this.limpiar(); this.actualizar();
      } catch (e) {
        if (e.codigo === "POSIBLE_DUPLICADO") { if (await UI.confirmar(e.message, { titulo: "Posible duplicado", ok: "Guardar de todos modos" })) this.guardar(true); }
        else await UI.intentar(() => { throw e; });
      } finally { UI.ocupado(false); }
    },
    actualizar() { this.lista(); },
    lista() {
      const d = Store.leer();
      const q = U.normalizar($("proBuscar").value), est = $("proEstado").value;
      const filas = d.proveedores.filter((p) => (!q || [p.nombre, p.identificacion].some((x) => U.normalizar(x).includes(q))) && (!est || (est === "activo") === (p.activo !== false)));
      $("proLista").innerHTML = UI.tabla([
        { t: "Proveedor", f: (p) => `<strong>${esc(p.nombre)}</strong>` }, { t: "Identificación", f: (p) => esc(p.identificacion || "—") }, { t: "Contacto", f: (p) => esc(p.contacto || "—") },
        { t: "Teléfono", f: (p) => esc(p.telefono || "—") }, { t: "Correo", f: (p) => esc(p.correo || "—") },
        { t: "Compras", f: (p) => { const r = Dom().resumenProveedor(d, p.id); return `${r.compras.length} · ${U.dinero(r.totalRecibido)} recibido`; } },
        { t: "Estado", f: (p) => UI.pastilla(p.activo === false ? "Inactivo" : "Activo", p.activo === false ? "cancelled" : "ok") },
        { t: "Acciones", f: (p) => `<button class="table-action" data-hist="${esc(p.id)}">Historial</button><button class="table-action" data-editar="${esc(p.id)}">Editar</button><button class="table-action" data-activar="${esc(p.id)}">${p.activo === false ? "Activar" : "Desactivar"}</button>` }
      ], filas, d.proveedores.length ? "Ningún proveedor coincide." : "Aún no hay proveedores. Registra el primero arriba.");
    },
    async accion(e) {
      const d = Store.leer();
      const h = e.target.closest("[data-hist]"), ed = e.target.closest("[data-editar]"), ac = e.target.closest("[data-activar]");
      if (h) {
        const p = Dom().proveedorDe(d, h.dataset.hist); if (!p) return;
        const r = Dom().resumenProveedor(d, p.id);
        UI.informacion(`Historial de ${p.nombre}`, `<h4>Compras</h4>${UI.tabla([{ t: "Número", f: (c) => esc(c.numero) }, { t: "Fecha", f: (c) => esc(U.fecha(c.fecha)) }, { t: "Total", f: (c) => U.dinero(c.total) }, { t: "Estado", f: (c) => esc(Dom().ESTADOS_COMPRA[c.estado]) }], r.compras, "Sin compras.")}
          <h4>Productos relacionados</h4>${UI.tabla([{ t: "Producto", f: (x) => esc(x.nombre) }, { t: "SKU", f: (x) => esc(x.codigo) }], r.productos, "Ningún producto asociado a este proveedor.")}
          <h4>Movimientos de inventario por sus compras</h4>${UI.tabla([{ t: "Fecha", f: (m) => esc(U.fecha(m.fecha)) }, { t: "Producto", f: (m) => esc(m.producto) }, { t: "Cantidad", f: (m) => String(m.delta) }, { t: "Compra", f: (m) => esc(m.origenNumero) }], r.movimientos, "Sin movimientos.")}`, { ancho: "grande" });
      }
      if (ed) {
        const p = Dom().proveedorDe(d, ed.dataset.editar); if (!p) return;
        $("proId").value = p.id; $("proNombre").value = p.nombre; $("proIdent").value = p.identificacion || ""; $("proContacto").value = p.contacto || ""; $("proTelefono").value = p.telefono || ""; $("proCorreo").value = p.correo || ""; $("proDireccion").value = p.direccion || ""; $("proObs").value = p.observaciones || "";
        $("proTitulo").textContent = "Editar proveedor"; $("proGuardar").textContent = "Guardar cambios"; $("proCancelar").hidden = false; $("proForm").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (ac) {
        const p = Dom().proveedorDe(d, ac.dataset.activar); if (!p) return;
        const activar = p.activo === false;
        if (!activar && !(await UI.confirmar(`"${p.nombre}" no aparecerá al crear compras nuevas, pero se conserva su historial.`, { titulo: "Desactivar proveedor", ok: "Desactivar" }))) return;
        if ((await UI.intentar(() => Dom().cambiarActivoTercero("proveedores", p.id, activar), activar ? "Proveedor activado." : "Proveedor desactivado.")).ok) this.lista();
      }
    }
  };

  /* ================= MÓDULO 8 · COMPRAS ================= */
  let compraEditor = null;
  const clasePill = { borrador: "", pendiente: "pending", parcial: "low", recibida: "done", cancelada: "cancelled" };
  UI.vistas.compras = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("ABASTECIMIENTO", "Compras", "Una compra pendiente NO suma inventario: las existencias entran al registrar la recepción.")}
        <div class="panel"><h3 id="comTitulo">Nueva compra</h3>
          <form id="comForm" class="form-grid" novalidate><input id="comId" type="hidden">
            <label>Proveedor *<select id="comProveedor" required></select></label>
            <label>Número de documento del proveedor<input id="comDocumento" maxlength="60" placeholder="Factura u orden del proveedor"></label>
            <label>Fecha<input id="comFecha" type="date" required></label>
            <label>Estado inicial<select id="comEstado"><option value="pendiente">Pendiente de recepción</option><option value="borrador">Borrador</option></select></label>
            <label class="span2">Observaciones<input id="comObs" maxlength="300"></label>
            <div class="full-width"><span class="lbl">Productos y costos</span><div id="comLineas"></div></div>
            <div class="full-width totales" id="comTotales"></div>
            <div class="form-actions full-width"><button id="comGuardar" class="btn btn-primary" type="submit">Guardar compra</button><button id="comCancelar" class="btn btn-light" type="button" hidden>Cancelar edición</button></div>
          </form></div>
        <div class="panel"><div class="panel-heading"><h3>Compras registradas</h3></div>
          <div class="filters-bar"><input id="comBuscar" type="search" placeholder="Buscar por número, documento o proveedor…" aria-label="Buscar compras">
            <select id="comFProveedor" aria-label="Proveedor"></select><select id="comFEstado" aria-label="Estado"></select>
            <label class="inline-field">Desde<input id="comDesde" type="date"></label><label class="inline-field">Hasta<input id="comHasta" type="date"></label></div>
          <div id="comLista"></div></div>`;
      $("comFecha").value = U.hoy();
      $("comFEstado").innerHTML = `<option value="">Todos los estados</option>` + Object.entries(Dom().ESTADOS_COMPRA).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
      compraEditor = UI.LineasEditor($("comLineas"), { modo: "costo", mostrarStock: false, alCambiar: () => this.totales() });
      ["comBuscar", "comFProveedor", "comFEstado", "comDesde", "comHasta"].forEach((id) => $(id).addEventListener("input", () => this.lista()));
      $("comCancelar").addEventListener("click", () => this.limpiar());
      $("comForm").addEventListener("submit", (e) => { e.preventDefault(); this.guardar(); });
      $("comLista").addEventListener("click", (e) => this.accion(e));
    },
    totales() { $("comTotales").innerHTML = `<div class="total-final"><span>Total de la compra</span><strong>${U.dinero(compraEditor.subtotal())}</strong></div>`; },
    limpiar() {
      $("comId").value = ""; compraEditor.limpiar(); $("comDocumento").value = ""; $("comObs").value = ""; $("comFecha").value = U.hoy(); $("comEstado").value = "pendiente"; $("comProveedor").value = "";
      $("comTitulo").textContent = "Nueva compra"; $("comGuardar").textContent = "Guardar compra"; $("comCancelar").hidden = true; this.totales();
    },
    async guardar() {
      const edicion = !!$("comId").value;
      const r = await UI.intentar(() => Dom().guardarCompra({ id: $("comId").value || null, proveedorId: $("comProveedor").value, documento: $("comDocumento").value, fecha: $("comFecha").value, estado: $("comEstado").value, observaciones: $("comObs").value, items: compraEditor.items() }));
      if (r.ok) { UI.mensaje(edicion ? `Compra ${r.valor.numero} actualizada.` : `Compra ${r.valor.numero} guardada (${Dom().ESTADOS_COMPRA[r.valor.estado]}). El inventario no cambia hasta recibir la mercancía.`); this.limpiar(); this.actualizar(); }
    },
    actualizar() {
      const d = Store.leer();
      $("comProveedor").innerHTML = opcionesProveedores(d, $("comProveedor").value, d.proveedores.length ? "Selecciona un proveedor" : "Primero crea un proveedor en el módulo Proveedores");
      const fp = $("comFProveedor").value;
      $("comFProveedor").innerHTML = UI.opciones(d.proveedores.map((p) => ({ v: p.id, t: p.nombre })), fp, "Todos los proveedores");
      compraEditor.refrescar(); this.totales(); this.lista();
    },
    lista() {
      const d = Store.leer();
      const q = U.normalizar($("comBuscar").value), prov = $("comFProveedor").value, est = $("comFEstado").value, desde = $("comDesde").value, hasta = $("comHasta").value;
      const filas = d.compras.filter((c) => (!q || U.normalizar([c.numero, c.documento, c.proveedorNombre].join(" ")).includes(q)) && (!prov || c.proveedorId === prov) && (!est || c.estado === est) && Dom().enRango(c.fecha, { desde, hasta }));
      $("comLista").innerHTML = UI.tabla([
        { t: "Número", f: (c) => `<strong>${esc(c.numero)}</strong>` }, { t: "Documento", f: (c) => esc(c.documento || "—") }, { t: "Fecha", f: (c) => esc(U.fecha(c.fecha)) }, { t: "Proveedor", f: (c) => esc(c.proveedorNombre) },
        { t: "Total", f: (c) => `<strong>${U.dinero(c.total)}</strong>` },
        { t: "Recibido", f: (c) => `${U.suma(c.items, (i) => i.recibida)} / ${U.suma(c.items, (i) => i.cantidad)} u.` },
        { t: "Estado", f: (c) => UI.pastilla(Dom().ESTADOS_COMPRA[c.estado], clasePill[c.estado]) },
        { t: "Acciones", f: (c) => {
          const sinRec = !(c.recepciones || []).length;
          return `<button class="table-action" data-ver="${esc(c.id)}">Detalle</button>`
            + (["borrador", "pendiente"].includes(c.estado) && sinRec ? `<button class="table-action" data-editar="${esc(c.id)}">Editar</button>` : "")
            + (c.estado === "borrador" ? `<button class="table-action" data-pendiente="${esc(c.id)}">Marcar pendiente</button>` : "")
            + (["pendiente", "parcial"].includes(c.estado) ? `<button class="table-action" data-recibir="${esc(c.id)}">Recibir mercancía</button>` : "")
            + (["borrador", "pendiente"].includes(c.estado) && sinRec ? `<button class="table-action danger" data-cancelar="${esc(c.id)}">Cancelar</button>` : "");
        } }
      ], filas, d.compras.length ? "Ninguna compra coincide con los filtros." : "No hay compras registradas.");
    },
    detalleHTML(c) {
      return `<dl class="detalle"><dt>Número</dt><dd>${esc(c.numero)}</dd><dt>Documento</dt><dd>${esc(c.documento || "—")}</dd><dt>Proveedor</dt><dd>${esc(c.proveedorNombre)}</dd><dt>Fecha</dt><dd>${esc(U.fecha(c.fecha))}</dd><dt>Estado</dt><dd>${esc(Dom().ESTADOS_COMPRA[c.estado])}</dd>${c.observaciones ? `<dt>Observaciones</dt><dd>${esc(c.observaciones)}</dd>` : ""}</dl>
        ${UI.tabla([{ t: "Producto", f: (i) => esc(i.nombre) }, { t: "Pedido", f: (i) => String(i.cantidad) }, { t: "Recibido", f: (i) => String(i.recibida) }, { t: "Costo unitario", f: (i) => U.dinero(i.costoUnitario) }, { t: "Subtotal", f: (i) => U.dinero(i.subtotal) }], c.items)}
        <div class="totales"><div class="total-final"><span>Total</span><strong>${U.dinero(c.total)}</strong></div></div>
        <h4>Recepciones</h4>${UI.tabla([{ t: "Fecha", f: (r) => esc(U.fecha(r.fecha)) }, { t: "Unidades", f: (r) => String(U.suma(r.items, (i) => i.cantidad)) }, { t: "Valor", f: (r) => U.dinero(r.valor) }, { t: "Nota", f: (r) => esc(r.nota || "—") }], c.recepciones || [], "Aún no se ha recibido mercancía.")}`;
    },
    abrirRecepcion(c) {
      const token = U.id();
      const pendientes = c.items.filter((i) => i.recibida < i.cantidad);
      const dlg = UI.dialogo(`<h3>Recibir mercancía · ${esc(c.numero)}</h3><p class="dlg-texto">Indica las cantidades que realmente llegaron. Solo esas unidades entrarán al inventario.</p>
        <form id="recForm" class="form-grid1">
          <label>Fecha de recepción<input id="recFecha" type="date" value="${U.hoy()}" required></label>
          <div class="table-wrap"><table><thead><tr><th>Producto</th><th>Pendiente</th><th>Recibido ahora</th></tr></thead><tbody>
          ${pendientes.map((i) => `<tr><td>${esc(i.nombre)}</td><td>${i.cantidad - i.recibida}</td><td><input type="number" class="rec-cant" data-p="${esc(i.productoId)}" min="0" max="${i.cantidad - i.recibida}" step="1" value="${i.cantidad - i.recibida}"></td></tr>`).join("")}
          </tbody></table></div>
          <label>Nota<input id="recNota" maxlength="300" placeholder="Opcional (ej. guía de transporte)"></label>
          <label class="check"><input type="checkbox" id="recCostos"> Actualizar el costo de los productos con el costo de esta compra</label>
          <div class="form-actions"><button id="recOk" class="btn btn-primary" type="submit">Confirmar recepción</button><button class="btn btn-light" type="button" data-c="1">Cancelar</button></div></form>`, { ancho: "grande" });
      dlg.querySelector("[data-c]").addEventListener("click", () => dlg.close());
      dlg.querySelector("#recForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const lineas = [...dlg.querySelectorAll(".rec-cant")].map((i) => ({ productoId: i.dataset.p, cantidad: Number(i.value) }));
        dlg.querySelector("#recOk").disabled = true;
        const r = await UI.intentar(() => Dom().recibirCompra(c.id, { token, fecha: dlg.querySelector("#recFecha").value, nota: dlg.querySelector("#recNota").value, lineas, actualizarCostos: dlg.querySelector("#recCostos").checked }));
        if (r.ok) { dlg.close(); UI.mensaje(`Recepción registrada en ${c.numero}. Inventario actualizado.`); this.actualizar(); }
        else dlg.querySelector("#recOk").disabled = false;
      });
    },
    async accion(e) {
      const d = Store.leer();
      const get = (a) => { const b = e.target.closest(`[data-${a}]`); return b ? d.compras.find((x) => x.id === b.dataset[a]) : null; };
      const ver = get("ver"), ed = get("editar"), pen = get("pendiente"), rec = get("recibir"), can = get("cancelar");
      if (ver) UI.informacion(`Compra ${ver.numero}`, this.detalleHTML(ver), { ancho: "grande" });
      if (ed) {
        $("comId").value = ed.id; $("comProveedor").innerHTML = opcionesProveedores(d, ed.proveedorId, "Selecciona un proveedor"); $("comProveedor").value = ed.proveedorId;
        $("comDocumento").value = ed.documento || ""; $("comFecha").value = ed.fecha; $("comEstado").value = ed.estado; $("comObs").value = ed.observaciones || ""; compraEditor.establecer(ed.items);
        $("comTitulo").textContent = `Editar compra ${ed.numero}`; $("comGuardar").textContent = "Guardar cambios"; $("comCancelar").hidden = false; $("comForm").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (pen && (await UI.intentar(() => Dom().cambiarEstadoCompra(pen.id, "pendiente"), `Compra ${pen.numero} pendiente de recepción.`)).ok) this.actualizar();
      if (rec) this.abrirRecepcion(rec);
      if (can) {
        if (!(await UI.confirmar(`¿Cancelar la compra ${can.numero}? No ha ingresado mercancía, por lo que el inventario no cambia.`, { titulo: "Cancelar compra", ok: "Cancelar compra", peligro: true }))) return;
        const motivo = await UI.pedirTexto("Cancelar compra", "Motivo (opcional)", { obligatorio: false, ok: "Confirmar cancelación", peligro: true });
        if (motivo === null) return;
        if ((await UI.intentar(() => Dom().cambiarEstadoCompra(can.id, "cancelada", motivo), `Compra ${can.numero} cancelada.`)).ok) this.actualizar();
      }
    }
  };
})(window);
