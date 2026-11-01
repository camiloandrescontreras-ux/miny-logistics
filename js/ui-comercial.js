"use strict";
/* MINY Logistics · Pantallas: Ventas (4), Pedidos (5) y Clientes (6) */
(function (global) {
  const { U, Store } = global.MINY;
  const UI = global.MINY.UI;
  const Dom = () => global.MINY.Dominio;
  const { $, esc } = UI;

  const opcionesClientes = (d, seleccionado, vacio) =>
    UI.opciones(d.clientes.filter((c) => c.activo !== false || c.id === seleccionado).map((c) => ({ v: c.id, t: c.nombre + (c.documento ? ` · ${c.documento}` : "") })), seleccionado, vacio);
  const opcionesPago = (sel, vacio) => UI.opciones(Dom().METODOS_PAGO.map((m) => ({ v: m, t: m })), sel, vacio);

  function pedirMetodoPago() {
    return new Promise((resolver) => {
      const dlg = UI.dialogo(`<h3>Entregar y generar venta</h3><p class="dlg-texto">Se creará una venta con los productos del pedido y se descontará el inventario una sola vez.</p>
        <div class="form-grid1"><label>Método de pago<select id="dlgPago">${opcionesPago("", "Sin indicar")}</select></label>
        <label>Condición de pago<select id="dlgCondicion"><option value="contado">De contado</option><option value="credito">A crédito o con abono</option></select></label>
        <label class="dlg-cred" hidden>Abono inicial (COP)<input id="dlgAbono" type="number" min="0" step="1" value="0"></label>
        <label class="dlg-cred" hidden>Fecha de vencimiento<input id="dlgVence" type="date"></label></div>
        <div class="form-actions"><button class="btn btn-primary" data-ok="1">Entregar y registrar venta</button><button class="btn btn-light" data-c="1">Cancelar</button></div>`);
      let valor = null;
      dlg.querySelector("#dlgCondicion").addEventListener("change", (e) => dlg.querySelectorAll(".dlg-cred").forEach((l) => { l.hidden = e.target.value !== "credito"; }));
      dlg.addEventListener("click", (e) => { if (e.target.closest("[data-ok]")) { valor = { metodoPago: dlg.querySelector("#dlgPago").value, condicion: dlg.querySelector("#dlgCondicion").value, abono: dlg.querySelector("#dlgAbono").value, vencimiento: dlg.querySelector("#dlgVence").value }; dlg.close(); } if (e.target.closest("[data-c]")) dlg.close(); });
      dlg.addEventListener("close", () => resolver(valor));
    });
  }

  function tablaItems(items, columnaUnit) {
    return UI.tabla([{ t: "Producto", f: (i) => `${esc(i.nombre)}<br><small>${esc(i.codigo)}</small>` }, { t: "Cantidad", f: (i) => String(i.cantidad) }, { t: columnaUnit, f: (i) => U.dinero(i.precioUnitario ?? i.costoUnitario) }, { t: "Subtotal", f: (i) => U.dinero(i.subtotal) }], items);
  }

  function cobroPill(v) {
    if (v.estado !== "confirmada") return "—";
    if (Dom().estaVencida(v)) return UI.pastilla("Vencida · saldo " + U.dinero(Dom().saldoVenta(v)), "cancelled");
    const e = Dom().estadoCobro(v);
    return UI.pastilla(e === "pagada" ? "Pagada" : `${Dom().ESTADOS_COBRO[e]} · saldo ${U.dinero(Dom().saldoVenta(v))}`, e === "pagada" ? "done" : "pending");
  }
  UI.cobroPill = cobroPill;

  /* ================= MÓDULO 4 · VENTAS ================= */
  let ventaEditor = null, ventaToken = U.id();
  UI.vistas.ventas = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("REGISTRO COMERCIAL", "Ventas", "Cada venta confirmada descuenta el inventario y se refleja en Finanzas sin duplicarse.")}
        <div class="panel"><h3>Nueva venta</h3>
          <form id="venForm" class="form-grid" novalidate>
            <label>Cliente<select id="venCliente"></select></label>
            <label>Fecha<input id="venFecha" type="date" required></label>
            <label>Método de pago<select id="venPago"></select></label>
            <label>Condición de pago<select id="venCondicion"><option value="contado">De contado (pagada ahora)</option><option value="credito">A crédito o con abono</option></select></label>
            <label class="v-credito">Abono inicial (COP)<input id="venAbono" type="number" min="0" step="1" value="0"></label>
            <label class="v-credito">Fecha de vencimiento<input id="venVence" type="date"></label>
            <div class="full-width"><span class="lbl">Productos</span><div id="venLineas"></div></div>
            <label>Descuento total (COP)<input id="venDescuento" type="number" min="0" step="1" value="0"></label>
            <label class="span2">Observaciones<input id="venObs" maxlength="300" placeholder="Opcional"></label>
            <div class="full-width totales" id="venTotales"></div>
            <div class="form-actions full-width"><button id="venConfirmar" class="btn btn-primary" type="submit">Confirmar venta</button><button id="venLimpiar" class="btn btn-light" type="button">Limpiar</button></div>
          </form></div>
        <div class="panel"><div class="panel-heading"><h3>Historial de ventas</h3></div>
          <div class="filters-bar"><input id="venBuscar" type="search" placeholder="Buscar por número o cliente…" aria-label="Buscar ventas">
            <select id="venEstado" aria-label="Estado"><option value="">Todas</option><option value="confirmada">Confirmadas</option><option value="anulada">Anuladas</option></select>
            <label class="inline-field">Desde<input id="venDesde" type="date"></label><label class="inline-field">Hasta<input id="venHasta" type="date"></label></div>
          <div id="venLista"></div></div>`;
      $("venFecha").value = U.hoy();
      ventaEditor = UI.LineasEditor($("venLineas"), { modo: "precio", mostrarStock: true, alCambiar: () => this.totales() });
      ["venBuscar", "venEstado", "venDesde", "venHasta"].forEach((id) => $(id).addEventListener("input", () => this.lista()));
      $("venDescuento").addEventListener("input", () => this.totales());
      $("venCondicion").addEventListener("change", () => this.totales());
      $("venAbono").addEventListener("input", () => this.totales());
      $("venLimpiar").addEventListener("click", () => this.limpiar());
      $("venForm").addEventListener("submit", (e) => { e.preventDefault(); this.confirmar(); });
      $("venLista").addEventListener("click", (e) => this.accion(e));
    },
    totales() {
      const sub = ventaEditor.subtotal();
      const desc = Math.max(0, Math.floor(Number($("venDescuento").value) || 0));
      const invalido = desc > sub;
      const credito = $("venCondicion").value === "credito";
      document.querySelectorAll(".v-credito").forEach((el) => { el.hidden = !credito; });
      const abono = Math.max(0, Math.floor(Number($("venAbono").value) || 0));
      const saldoTxt = credito ? `<div><span>Abono inicial</span><strong>${U.dinero(abono)}</strong></div><div class="total-final"><span>Saldo por cobrar</span><strong>${U.dinero(Math.max(0, sub - desc - abono))}</strong></div>` : "";
      $("venTotales").innerHTML = saldoTxt + `<div><span>Subtotal</span><strong>${U.dinero(sub)}</strong></div><div><span>Descuento</span><strong>${U.dinero(desc)}</strong></div><div class="total-final"><span>Total</span><strong>${U.dinero(Math.max(0, sub - desc))}</strong></div>${invalido ? '<p class="aviso aviso-alerta">El descuento no puede superar el subtotal.</p>' : ""}`;
    },
    limpiar() {
      ventaEditor.limpiar(); $("venDescuento").value = "0"; $("venAbono").value = "0"; $("venVence").value = ""; $("venCondicion").value = "contado"; $("venObs").value = ""; $("venFecha").value = U.hoy(); $("venPago").value = ""; $("venCliente").value = ""; ventaToken = U.id(); this.totales();
    },
    async confirmar() {
      const datos = { token: ventaToken, clienteId: $("venCliente").value, fecha: $("venFecha").value, metodoPago: $("venPago").value, condicion: $("venCondicion").value, abono: $("venAbono").value, vencimiento: $("venVence").value, items: ventaEditor.items(), descuento: $("venDescuento").value, observaciones: $("venObs").value };
      const r = await UI.intentar(() => Dom().crearVenta(datos));
      if (r.ok) { UI.mensaje(`Venta ${r.valor.numero} registrada por ${U.dinero(r.valor.total)}. Inventario actualizado.` + (r.valor.condicion === "credito" ? ` Saldo por cobrar: ${U.dinero(Dom().saldoVenta(r.valor))}.` : "")); this.limpiar(); this.actualizar(); }
    },
    actualizar() {
      const d = Store.leer();
      const c = $("venCliente").value;
      $("venCliente").innerHTML = opcionesClientes(d, c, "Sin cliente identificado");
      $("venPago").innerHTML = opcionesPago($("venPago").value, "Sin indicar");
      ventaEditor.refrescar(); this.totales(); this.lista();
    },
    lista() {
      const d = Store.leer();
      const q = U.normalizar($("venBuscar").value), est = $("venEstado").value, desde = $("venDesde").value, hasta = $("venHasta").value;
      const filas = d.ventas.filter((v) => (!q || U.normalizar(v.numero + " " + v.clienteNombre).includes(q)) && (!est || v.estado === est) && Dom().enRango(v.fecha, { desde, hasta }));
      $("venLista").innerHTML = UI.tabla([
        { t: "Número", f: (v) => `<strong>${esc(v.numero)}</strong>` }, { t: "Fecha", f: (v) => esc(U.fecha(v.fecha)) }, { t: "Cliente", f: (v) => esc(v.clienteNombre || "Sin cliente") },
        { t: "Productos", f: (v) => esc(v.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(", ").slice(0, 80)) },
        { t: "Total", f: (v) => `<strong>${U.dinero(v.total)}</strong>` }, { t: "Pago", f: (v) => esc(v.metodoPago || "—") },
        { t: "Cobro", f: (v) => cobroPill(v) },
        { t: "Estado", f: (v) => UI.pastilla(v.estado === "anulada" ? "Anulada" : "Confirmada", v.estado === "anulada" ? "cancelled" : "done") },
        { t: "Acciones", f: (v) => `<button class="table-action" data-ver="${esc(v.id)}">Detalle</button><button class="table-action" data-imprimir="${esc(v.id)}">Comprobante</button>${v.estado === "confirmada" ? `<button class="table-action danger" data-anular="${esc(v.id)}">Anular</button>` : ""}` }
      ], filas, d.ventas.length ? "Ninguna venta coincide con los filtros." : "No hay ventas registradas.");
    },
    detalleHTML(d, v) {
      return `<dl class="detalle"><dt>Número</dt><dd>${esc(v.numero)}</dd><dt>Fecha</dt><dd>${esc(U.fecha(v.fecha))}</dd><dt>Cliente</dt><dd>${esc(v.clienteNombre || "Sin cliente identificado")}</dd><dt>Método de pago</dt><dd>${esc(v.metodoPago || "—")}</dd><dt>Condición</dt><dd>${Array.isArray(v.pagos) ? (v.condicion === "credito" ? "A crédito" + (v.vencimiento ? " · vence " + esc(U.fecha(v.vencimiento)) : "") : "De contado") : "De contado (anterior al módulo de cobros)"}</dd>
        <dt>Estado</dt><dd>${esc(v.estado === "anulada" ? "Anulada" : "Confirmada")}${v.motivoAnulacion ? ` · Motivo: ${esc(v.motivoAnulacion)}` : ""}</dd>${v.pedidoId ? `<dt>Origen</dt><dd>${esc(v.observaciones)}</dd>` : v.observaciones ? `<dt>Observaciones</dt><dd>${esc(v.observaciones)}</dd>` : ""}</dl>
        ${tablaItems(v.items, "Precio unitario")}${Array.isArray(v.pagos) && v.pagos.length ? "<h4>Cobros y abonos</h4>" + UI.tabla([{ t: "Fecha", f: (p) => esc(U.fecha(p.fecha)) }, { t: "Valor", f: (p) => U.dinero(p.valor) }, { t: "Método", f: (p) => esc(p.metodoPago || "—") }, { t: "Estado", f: (p) => esc(p.estado === "anulado" ? "Anulado" : "Vigente") }], v.pagos) : ""}<div class="totales"><div><span>Subtotal</span><strong>${U.dinero(v.subtotal)}</strong></div><div><span>Descuento</span><strong>${U.dinero(v.descuento)}</strong></div><div class="total-final"><span>Total</span><strong>${U.dinero(v.total)}</strong></div>${v.estado === "confirmada" && Dom().saldoVenta(v) > 0 ? `<div><span>Saldo por cobrar</span><strong>${U.dinero(Dom().saldoVenta(v))}</strong></div>` : ""}</div>`;
    },
    comprobante(d, v) {
      const negocio = d.config.negocio || "MINY Logistics";
      return `<div class="comprobante"><h2>${esc(negocio)}</h2><p><strong>Comprobante de venta ${esc(v.numero)}</strong></p>
        <p class="nota-legal">Documento de control interno. No es una factura electrónica ni un documento tributario oficial.</p>
        <p>Fecha: ${esc(U.fecha(v.fecha))}<br>Cliente: ${esc(v.clienteNombre || "Sin cliente identificado")}<br>Pago: ${esc(v.metodoPago || "—")}${v.estado === "anulada" ? "<br><strong>VENTA ANULADA</strong>" : ""}</p>
        ${tablaItems(v.items, "Precio unitario")}<p class="der">Subtotal: ${U.dinero(v.subtotal)}<br>Descuento: ${U.dinero(v.descuento)}<br><strong>Total: ${U.dinero(v.total)}</strong>${v.estado === "confirmada" && Array.isArray(v.pagos) ? `<br>Pagado: ${U.dinero(Dom().pagadoVenta(v))}<br><strong>Saldo: ${U.dinero(Dom().saldoVenta(v))}</strong>` : ""}</p>${v.observaciones ? `<p>Observaciones: ${esc(v.observaciones)}</p>` : ""}<p class="nota-legal">Gracias por su compra.</p></div>`;
    },
    async accion(e) {
      const ver = e.target.closest("[data-ver]"), imp = e.target.closest("[data-imprimir]"), anu = e.target.closest("[data-anular]");
      const d = Store.leer();
      if (ver) { const v = d.ventas.find((x) => x.id === ver.dataset.ver); if (v) UI.informacion(`Venta ${v.numero}`, this.detalleHTML(d, v), { ancho: "grande" }); }
      if (imp) {
        const v = d.ventas.find((x) => x.id === imp.dataset.imprimir); if (!v) return;
        const area = $("areaImpresion"); area.innerHTML = this.comprobante(d, v);
        document.body.classList.add("imprimiendo");
        const limpiar = () => { document.body.classList.remove("imprimiendo"); area.innerHTML = ""; window.removeEventListener("afterprint", limpiar); };
        window.addEventListener("afterprint", limpiar);
        try { window.print(); } finally { if (!("onafterprint" in window)) limpiar(); }
      }
      if (anu) {
        const v = d.ventas.find((x) => x.id === anu.dataset.anular); if (!v) return;
        if (!(await UI.confirmar(`Se anulará la venta ${v.numero} y las unidades volverán al inventario.` + (Dom().pagadoVenta(v) > 0 && Array.isArray(v.pagos) ? ` También se anularán los cobros registrados (${U.dinero(Dom().pagadoVenta(v))}); si ya recibiste ese dinero, devuélvelo al cliente.` : "") + " Esta acción queda registrada y no se puede deshacer.", { titulo: "Anular venta", ok: "Continuar", peligro: true }))) return;
        const motivo = await UI.pedirTexto("Motivo de la anulación", "Escribe por qué se anula la venta", { ok: "Anular venta", peligro: true });
        if (motivo === null) return;
        if ((await UI.intentar(() => Dom().anularVenta(v.id, motivo), `Venta ${v.numero} anulada; el inventario fue restituido.`)).ok) this.actualizar();
      }
    }
  };

  /* ================= MÓDULO 5 · PEDIDOS ================= */
  let pedidoEditor = null;
  const ETIQUETA_ACCION = { confirmado: "Confirmar", en_preparacion: "Iniciar preparación", listo: "Marcar listo", entregado: "Entregar y generar venta", cancelado: "Cancelar pedido" };
  UI.vistas.pedidos = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("SEGUIMIENTO", "Pedidos", "El inventario se descuenta únicamente al entregar el pedido (se convierte en una sola venta).")}
        <div class="aviso aviso-info">Los pedidos <strong>confirmados, en preparación o listos</strong> comprometen unidades (se muestran como “comprometidas”), pero solo al <strong>entregar</strong> se genera la venta y se descuentan las existencias.</div>
        <div class="panel"><h3 id="pedTitulo">Crear pedido</h3>
          <form id="pedForm" class="form-grid" novalidate><input id="pedId" type="hidden">
            <label>Cliente *<select id="pedCliente" required></select></label>
            <label>Fecha<input id="pedFecha" type="date" required></label>
            <label>Observaciones<input id="pedObs" maxlength="300" placeholder="Notas del pedido"></label>
            <div class="full-width"><span class="lbl">Productos</span><div id="pedLineas"></div></div>
            <div class="full-width totales" id="pedTotales"></div>
            <div class="form-actions full-width"><button id="pedGuardar" class="btn btn-primary" type="submit">Guardar pedido</button><button id="pedCancelar" class="btn btn-light" type="button" hidden>Cancelar edición</button></div>
          </form></div>
        <div class="panel"><div class="panel-heading"><h3>Pedidos registrados</h3></div>
          <div class="filters-bar"><input id="pedBuscar" type="search" placeholder="Buscar por número o cliente…" aria-label="Buscar pedidos">
            <select id="pedEstado" aria-label="Estado"></select>
            <label class="inline-field">Desde<input id="pedDesde" type="date"></label><label class="inline-field">Hasta<input id="pedHasta" type="date"></label></div>
          <div id="pedLista"></div></div>`;
      $("pedFecha").value = U.hoy();
      $("pedEstado").innerHTML = `<option value="">Todos los estados</option>` + Object.entries(Dom().ESTADOS_PEDIDO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
      pedidoEditor = UI.LineasEditor($("pedLineas"), { modo: "precio", mostrarStock: true, alCambiar: () => this.totales() });
      ["pedBuscar", "pedEstado", "pedDesde", "pedHasta"].forEach((id) => $(id).addEventListener("input", () => this.lista()));
      $("pedCancelar").addEventListener("click", () => this.limpiar());
      $("pedForm").addEventListener("submit", (e) => { e.preventDefault(); this.guardar(); });
      $("pedLista").addEventListener("click", (e) => this.accion(e));
    },
    totales() { $("pedTotales").innerHTML = `<div class="total-final"><span>Total del pedido</span><strong>${U.dinero(pedidoEditor.subtotal())}</strong></div>`; },
    limpiar() {
      $("pedId").value = ""; pedidoEditor.limpiar(); $("pedObs").value = ""; $("pedFecha").value = U.hoy(); $("pedCliente").value = "";
      $("pedTitulo").textContent = "Crear pedido"; $("pedGuardar").textContent = "Guardar pedido"; $("pedCancelar").hidden = true; this.totales();
    },
    async guardar() {
      const edicion = !!$("pedId").value;
      const r = await UI.intentar(() => Dom().guardarPedido({ id: $("pedId").value || null, clienteId: $("pedCliente").value, fecha: $("pedFecha").value, observaciones: $("pedObs").value, items: pedidoEditor.items() }));
      if (r.ok) { UI.mensaje(edicion ? `Pedido ${r.valor.numero} actualizado.` : `Pedido ${r.valor.numero} creado en estado Pendiente.`); this.limpiar(); this.actualizar(); }
    },
    actualizar() {
      const d = Store.leer();
      $("pedCliente").innerHTML = opcionesClientes(d, $("pedCliente").value, d.clientes.length ? "Selecciona un cliente" : "Primero crea un cliente en el módulo Clientes");
      pedidoEditor.refrescar(); this.totales(); this.lista();
    },
    lista() {
      const d = Store.leer();
      const q = U.normalizar($("pedBuscar").value), est = $("pedEstado").value, desde = $("pedDesde").value, hasta = $("pedHasta").value;
      const filas = d.pedidos.filter((o) => (!q || U.normalizar(o.numero + " " + o.clienteNombre).includes(q)) && (!est || o.estado === est) && Dom().enRango(o.fecha, { desde, hasta }));
      const clase = { entregado: "done", cancelado: "cancelled" };
      $("pedLista").innerHTML = UI.tabla([
        { t: "Número", f: (o) => `<strong>${esc(o.numero)}</strong>` }, { t: "Fecha", f: (o) => esc(U.fecha(o.fecha)) }, { t: "Cliente", f: (o) => esc(o.clienteNombre) },
        { t: "Productos", f: (o) => esc(o.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(", ").slice(0, 70)) }, { t: "Total", f: (o) => `<strong>${U.dinero(o.total)}</strong>` },
        { t: "Estado", f: (o) => UI.pastilla(Dom().ESTADOS_PEDIDO[o.estado] || o.estado, clase[o.estado] || "pending") },
        { t: "Existencias", f: (o) => { if (["entregado", "cancelado"].includes(o.estado)) return "—"; const ok = Dom().disponibilidadPedido(d, o).every((x) => x.suficiente); return UI.pastilla(ok ? "Disponibles" : "Faltan unidades", ok ? "ok" : "low"); } },
        { t: "Acciones", f: (o) => {
          const sig = (Dom().TRANSICIONES_PEDIDO[o.estado] || []).map((s) => `<button class="table-action ${s === "cancelado" ? "danger" : ""}" data-estado="${s}" data-id="${esc(o.id)}">${ETIQUETA_ACCION[s]}</button>`).join("");
          return `<button class="table-action" data-ver="${esc(o.id)}">Detalle</button>${["pendiente", "confirmado"].includes(o.estado) ? `<button class="table-action" data-editar="${esc(o.id)}">Editar</button>` : ""}${sig}`;
        } }
      ], filas, d.pedidos.length ? "Ningún pedido coincide con los filtros." : "No hay pedidos registrados.");
    },
    detalleHTML(d, o) {
      const disp = Dom().disponibilidadPedido(d, o);
      const activo = !["entregado", "cancelado"].includes(o.estado);
      return `<dl class="detalle"><dt>Número</dt><dd>${esc(o.numero)}</dd><dt>Fecha</dt><dd>${esc(U.fecha(o.fecha))}</dd><dt>Cliente</dt><dd>${esc(o.clienteNombre)}</dd><dt>Estado</dt><dd>${esc(Dom().ESTADOS_PEDIDO[o.estado])}</dd>
        ${o.ventaNumero ? `<dt>Venta generada</dt><dd>${esc(o.ventaNumero)}</dd>` : ""}${o.observaciones ? `<dt>Observaciones</dt><dd>${esc(o.observaciones)}</dd>` : ""}</dl>
        ${activo ? UI.tabla([{ t: "Producto", f: (i) => esc(i.nombre) }, { t: "Pedido", f: (i) => String(i.requerido) }, { t: "En inventario", f: (i) => String(i.stock) }, { t: "Comprometidas en otros pedidos", f: (i) => String(i.comprometidoOtros) }, { t: "Estado", f: (i) => UI.pastilla(i.sinConflicto ? "Disponible" : i.suficiente ? "Disponible, pero comprometido" : "Faltan unidades", i.sinConflicto ? "ok" : "low") }], disp) : tablaItems(o.items, "Precio unitario")}
        <div class="totales"><div class="total-final"><span>Total</span><strong>${U.dinero(o.total)}</strong></div></div>
        <h4>Historial de estados</h4>${UI.tabla([{ t: "Fecha", f: (h) => esc(U.fechaHora(h.fecha)) }, { t: "Cambio", f: (h) => esc((h.de ? Dom().ESTADOS_PEDIDO[h.de] + " → " : "") + Dom().ESTADOS_PEDIDO[h.a]) }, { t: "Nota", f: (h) => esc(h.nota || "—") }], o.historial.slice().reverse())}`;
    },
    async accion(e) {
      const d = Store.leer();
      const ver = e.target.closest("[data-ver]"), ed = e.target.closest("[data-editar]"), est = e.target.closest("[data-estado]");
      if (ver) { const o = d.pedidos.find((x) => x.id === ver.dataset.ver); if (o) UI.informacion(`Pedido ${o.numero}`, this.detalleHTML(d, o), { ancho: "grande" }); }
      if (ed) {
        const o = d.pedidos.find((x) => x.id === ed.dataset.editar); if (!o) return;
        $("pedId").value = o.id; $("pedCliente").innerHTML = opcionesClientes(d, o.clienteId, "Selecciona un cliente"); $("pedCliente").value = o.clienteId; $("pedFecha").value = o.fecha || U.hoy(); $("pedObs").value = o.observaciones || "";
        pedidoEditor.establecer(o.items);
        $("pedTitulo").textContent = `Editar pedido ${o.numero}`; $("pedGuardar").textContent = "Guardar cambios"; $("pedCancelar").hidden = false;
        $("pedForm").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (est) {
        const o = d.pedidos.find((x) => x.id === est.dataset.id); if (!o) return;
        const nuevo = est.dataset.estado;
        if (nuevo === "entregado") {
          const pago = await pedirMetodoPago(); if (pago === null) return;
          const r = await UI.intentar(() => Dom().entregarPedido(o.id, pago));
          if (r.ok) { UI.mensaje(`Pedido ${o.numero} entregado. Se generó la venta ${r.valor.venta.numero} y se descontó el inventario.`); this.actualizar(); }
          return;
        }
        let nota = "";
        if (nuevo === "cancelado") {
          nota = await UI.pedirTexto("Cancelar pedido", "Motivo de la cancelación (opcional)", { obligatorio: false, ok: "Cancelar pedido", peligro: true });
          if (nota === null) return;
        }
        if ((await UI.intentar(() => Dom().cambiarEstadoPedido(o.id, nuevo, nota), `Pedido ${o.numero}: ${Dom().ESTADOS_PEDIDO[nuevo]}.`)).ok) this.actualizar();
      }
    }
  };

  /* ================= MÓDULO 6 · CLIENTES ================= */
  UI.vistas.clientes = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("RELACIÓN CON CLIENTES", "Clientes", "Solo el nombre es obligatorio; el resto de datos es opcional.")}
        <div class="panel"><h3 id="cliTitulo">Registrar cliente</h3>
          <form id="cliForm" class="form-grid" novalidate><input id="cliId" type="hidden">
            <label>Nombre o razón social *<input id="cliNombre" required maxlength="140"></label>
            <label>Documento (opcional)<input id="cliDocumento" maxlength="40"></label>
            <label>Teléfono<input id="cliTelefono" maxlength="20" inputmode="tel"></label>
            <label>Correo electrónico<input id="cliCorreo" type="email" maxlength="120"></label>
            <label class="span2">Dirección<input id="cliDireccion" maxlength="200"></label>
            <label class="full-width">Observaciones<input id="cliObs" maxlength="500"></label>
            <div class="form-actions full-width"><button id="cliGuardar" class="btn btn-primary" type="submit">Guardar cliente</button><button id="cliCancelar" class="btn btn-light" type="button" hidden>Cancelar edición</button></div>
          </form></div>
        <div class="panel"><div class="panel-heading"><h3>Listado de clientes</h3></div>
          <div class="filters-bar"><input id="cliBuscar" type="search" placeholder="Buscar por nombre, documento o teléfono…" aria-label="Buscar clientes">
            <select id="cliEstado" aria-label="Estado"><option value="">Todos</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select></div>
          <div id="cliLista"></div></div>`;
      ["cliBuscar", "cliEstado"].forEach((id) => $(id).addEventListener("input", () => this.lista()));
      $("cliCancelar").addEventListener("click", () => this.limpiar());
      $("cliForm").addEventListener("submit", (e) => { e.preventDefault(); this.guardar(false); });
      $("cliLista").addEventListener("click", (e) => this.accion(e));
    },
    limpiar() { $("cliForm").reset(); $("cliId").value = ""; $("cliTitulo").textContent = "Registrar cliente"; $("cliGuardar").textContent = "Guardar cliente"; $("cliCancelar").hidden = true; },
    async guardar(forzar) {
      const datos = { id: $("cliId").value || null, nombre: $("cliNombre").value, documento: $("cliDocumento").value, telefono: $("cliTelefono").value, correo: $("cliCorreo").value, direccion: $("cliDireccion").value, observaciones: $("cliObs").value, forzar };
      UI.ocupado(true);
      try {
        const c = await Dom().guardarCliente(datos);
        UI.mensaje(datos.id ? "Cliente actualizado." : `Cliente "${c.nombre}" guardado.`); this.limpiar(); this.actualizar();
      } catch (e) {
        if (e.codigo === "POSIBLE_DUPLICADO") { if (await UI.confirmar(e.message, { titulo: "Posible duplicado", ok: "Guardar de todos modos" })) this.guardar(true); }
        else await UI.intentar(() => { throw e; });
      } finally { UI.ocupado(false); }
    },
    actualizar() { this.lista(); },
    lista() {
      const d = Store.leer();
      const q = U.normalizar($("cliBuscar").value), est = $("cliEstado").value;
      const filas = d.clientes.filter((c) => (!q || [c.nombre, c.documento, c.telefono].some((x) => U.normalizar(x).includes(q))) && (!est || (est === "activo") === (c.activo !== false)));
      $("cliLista").innerHTML = UI.tabla([
        { t: "Cliente", f: (c) => `<strong>${esc(c.nombre)}</strong>` }, { t: "Documento", f: (c) => esc(c.documento || "—") }, { t: "Teléfono", f: (c) => esc(c.telefono || "—") }, { t: "Correo", f: (c) => esc(c.correo || "—") },
        { t: "Compras (histórico)", f: (c) => { const r = Dom().resumenCliente(d, c.id); return `${U.dinero(r.totalCompras)}<br><small>${r.cantidadVentas} venta(s) · ${r.pedidos.length} pedido(s)</small>${r.saldo > 0 ? `<br><span class="status-pill pending">Debe ${U.dinero(r.saldo)}</span>` : ""}`; } },
        { t: "Estado", f: (c) => UI.pastilla(c.activo === false ? "Inactivo" : "Activo", c.activo === false ? "cancelled" : "ok") },
        { t: "Acciones", f: (c) => `<button class="table-action" data-hist="${esc(c.id)}">Historial</button><button class="table-action" data-editar="${esc(c.id)}">Editar</button><button class="table-action" data-activar="${esc(c.id)}">${c.activo === false ? "Activar" : "Desactivar"}</button>` }
      ], filas, d.clientes.length ? "Ningún cliente coincide." : "Aún no hay clientes. Registra el primero arriba.");
    },
    async accion(e) {
      const d = Store.leer();
      const h = e.target.closest("[data-hist]"), ed = e.target.closest("[data-editar]"), ac = e.target.closest("[data-activar]");
      if (h) {
        const c = Dom().clienteDe(d, h.dataset.hist); if (!c) return;
        const r = Dom().resumenCliente(d, c.id);
        UI.informacion(`Historial de ${c.nombre}`, `<p><strong>Total histórico de compras (ventas confirmadas):</strong> ${U.dinero(r.totalCompras)} en ${r.cantidadVentas} venta(s).${r.saldo > 0 ? ` <strong>Saldo pendiente de pago: ${U.dinero(r.saldo)}.</strong>` : ""}</p><h4>Ventas</h4>${UI.tabla([{ t: "Número", f: (v) => esc(v.numero) }, { t: "Fecha", f: (v) => esc(U.fecha(v.fecha)) }, { t: "Total", f: (v) => U.dinero(v.total) }, { t: "Estado", f: (v) => esc(v.estado) }], r.ventas, "Sin ventas asociadas.")}<h4>Pedidos</h4>${UI.tabla([{ t: "Número", f: (o) => esc(o.numero) }, { t: "Fecha", f: (o) => esc(U.fecha(o.fecha)) }, { t: "Total", f: (o) => U.dinero(o.total) }, { t: "Estado", f: (o) => esc(Dom().ESTADOS_PEDIDO[o.estado]) }], r.pedidos, "Sin pedidos asociados.")}`, { ancho: "grande" });
      }
      if (ed) {
        const c = Dom().clienteDe(d, ed.dataset.editar); if (!c) return;
        $("cliId").value = c.id; $("cliNombre").value = c.nombre; $("cliDocumento").value = c.documento || ""; $("cliTelefono").value = c.telefono || ""; $("cliCorreo").value = c.correo || ""; $("cliDireccion").value = c.direccion || ""; $("cliObs").value = c.observaciones || "";
        $("cliTitulo").textContent = "Editar cliente"; $("cliGuardar").textContent = "Guardar cambios"; $("cliCancelar").hidden = false; $("cliForm").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (ac) {
        const c = Dom().clienteDe(d, ac.dataset.activar); if (!c) return;
        const activar = c.activo === false;
        if (!activar && !(await UI.confirmar(`"${c.nombre}" no aparecerá al crear ventas o pedidos nuevos, pero conservará su historial.`, { titulo: "Desactivar cliente", ok: "Desactivar" }))) return;
        if ((await UI.intentar(() => Dom().cambiarActivoTercero("clientes", c.id, activar), activar ? "Cliente activado." : "Cliente desactivado.")).ok) this.lista();
      }
    }
  };
})(window);
