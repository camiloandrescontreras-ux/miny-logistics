"use strict";
/* MINY Logistics · Pantalla: Cobros y cartera (14) — ventas a crédito, abonos y saldos por cobrar */
(function (global) {
  const { U, Store } = global.MINY;
  const UI = global.MINY.UI;
  const Dom = () => global.MINY.Dominio;
  const { $, esc } = UI;

  const ESTADOS = [["saldo", "Con saldo pendiente"], ["vencida", "Vencidas"], ["pendiente", "Sin ningún abono"], ["parcial", "Con abonos parciales"], ["pagada", "Pagadas"], ["todas", "Todas"]];

  function filasFiltradas(d) {
    const q = U.normalizar($("cobBuscar").value), cli = $("cobCliente").value, est = $("cobEstado").value, desde = $("cobDesde").value, hasta = $("cobHasta").value;
    return d.ventas.filter((v) => v.estado === "confirmada" && Array.isArray(v.pagos) && Dom().enRango(v.fecha, { desde, hasta }) && (!cli || v.clienteId === cli) && (!q || U.normalizar(v.numero + " " + v.clienteNombre).includes(q))
      && ({ saldo: Dom().saldoVenta(v) > 0, vencida: Dom().estaVencida(v), pendiente: Dom().estadoCobro(v) === "pendiente", parcial: Dom().estadoCobro(v) === "parcial", pagada: Dom().estadoCobro(v) === "pagada", todas: true }[est]));
  }
  const textoRecordatorio = (d, v) => {
    const negocio = d.config.negocio || "nuestro negocio";
    const vence = v.vencimiento ? (Dom().estaVencida(v) ? ` que venció el ${U.fecha(v.vencimiento)}` : ` que vence el ${U.fecha(v.vencimiento)}`) : "";
    return `Hola ${v.clienteNombre || ""} 👋 Te escribimos de ${negocio}. Te recordamos que tienes un saldo pendiente de ${U.dinero(Dom().saldoVenta(v))} de la venta ${v.numero}${vence}. ¿Cuándo podrías ponerte al día? ¡Gracias!`.replace("  ", " ");
  };

  UI.vistas.cobros = {
    montar(sec) {
      sec.innerHTML = `${UI.encabezado("CARTERA", "Cobros y cartera", "Controla las ventas a crédito, registra abonos y consulta cuánto te deben.")}
        <div class="aviso aviso-info">Las ventas a crédito se crean en el módulo <a href="#ventas" data-ir="ventas">Ventas</a> (condición “A crédito o con abono”) o al entregar un pedido. En Finanzas, el dinero cuenta como ingreso <strong>cuando se cobra</strong>, no cuando se vende. Las ventas anteriores a este módulo se consideran pagadas.</div>
        <div id="cobStats" class="stats-grid"></div>
        <div class="panel"><div class="panel-heading"><h3>Saldos por cliente</h3></div><div id="cobPorCliente"></div></div>
        <div class="panel"><div class="panel-heading"><h3>Ventas y cobros</h3></div>
          <div class="filters-bar"><input id="cobBuscar" type="search" placeholder="Buscar por número o cliente…" aria-label="Buscar">
            <select id="cobCliente" aria-label="Cliente"></select><select id="cobEstado" aria-label="Estado"></select>
            <label class="inline-field">Desde<input id="cobDesde" type="date"></label><label class="inline-field">Hasta<input id="cobHasta" type="date"></label></div>
          <div id="cobLista"></div></div>`;
      $("cobEstado").innerHTML = UI.opciones(ESTADOS.map(([v, t]) => ({ v, t })), "saldo");
      ["cobBuscar", "cobCliente", "cobEstado", "cobDesde", "cobHasta"].forEach((id) => $(id).addEventListener("input", () => this.lista()));
      $("cobLista").addEventListener("click", (e) => this.accion(e));
      $("cobPorCliente").addEventListener("click", (e) => { const b = e.target.closest("[data-filtrar]"); if (b) { $("cobCliente").value = b.dataset.filtrar; $("cobEstado").value = "saldo"; this.lista(); $("cobLista").scrollIntoView({ behavior: "smooth", block: "start" }); } });
    },
    limpiar() { if ($("cobBuscar")) { $("cobBuscar").value = ""; $("cobCliente").value = ""; $("cobEstado").value = "saldo"; $("cobDesde").value = ""; $("cobHasta").value = ""; } },
    actualizar() {
      const d = Store.leer();
      const prev = $("cobCliente").value;
      $("cobCliente").innerHTML = UI.opciones(d.clientes.map((c) => ({ v: c.id, t: c.nombre })), prev, "Todos los clientes");
      const rc = Dom().resumenCartera(d);
      const mes = Dom().libroFinanzas(d, { desde: U.hoy().slice(0, 8) + "01", hasta: U.hoy(), origen: "cobro" });
      $("cobStats").innerHTML = UI.stat("Por cobrar", U.dinero(rc.total), `${rc.cantidad} venta(s) con saldo`) + UI.stat("Vencido", U.dinero(rc.vencido), `${rc.vencidas} venta(s) vencida(s)`)
        + UI.stat("Cobrado este mes", U.dinero(U.suma(mes, (r) => r.valor)), `${mes.length} cobro(s)`) + UI.stat("Clientes con deuda", String(rc.porCliente.filter((c) => c.clienteId).length));
      $("cobPorCliente").innerHTML = UI.tabla([
        { t: "Cliente", f: (c) => `<strong>${esc(c.cliente)}</strong>` }, { t: "Ventas con saldo", f: (c) => String(c.ventas) }, { t: "Saldo", f: (c) => `<strong>${U.dinero(c.saldo)}</strong>` },
        { t: "Vencido", f: (c) => (c.vencido ? `<span class="neg">${U.dinero(c.vencido)}</span>` : "—") },
        { t: "", f: (c) => (c.clienteId ? `<button class="table-action" data-filtrar="${esc(c.clienteId)}">Ver ventas</button>` : "") }
      ], rc.porCliente, "Nadie te debe dinero por ahora. 🎉");
      this.lista();
    },
    lista() {
      const d = Store.leer();
      const filas = filasFiltradas(d).sort((a, b) => Number(Dom().estaVencida(b)) - Number(Dom().estaVencida(a)) || String(b.fecha).localeCompare(String(a.fecha)));
      $("cobLista").innerHTML = UI.tabla([
        { t: "Venta", f: (v) => `<strong>${esc(v.numero)}</strong>` }, { t: "Fecha", f: (v) => esc(U.fecha(v.fecha)) }, { t: "Cliente", f: (v) => esc(v.clienteNombre || "Sin cliente") },
        { t: "Total", f: (v) => U.dinero(v.total) }, { t: "Pagado", f: (v) => U.dinero(Dom().pagadoVenta(v)) }, { t: "Saldo", f: (v) => `<strong>${U.dinero(Dom().saldoVenta(v))}</strong>` },
        { t: "Vence", f: (v) => esc(v.vencimiento ? U.fecha(v.vencimiento) : "—") }, { t: "Estado", f: (v) => UI.cobroPill(v) },
        { t: "Acciones", f: (v) => `${Dom().saldoVenta(v) > 0 ? `<button class="table-action" data-abonar="${esc(v.id)}">Registrar abono</button><button class="table-action" data-recordar="${esc(v.id)}">Recordatorio</button>` : ""}<button class="table-action" data-detalle="${esc(v.id)}">Detalle</button>` }
      ], filas, d.ventas.some((v) => Array.isArray(v.pagos)) ? "Ninguna venta coincide con este filtro." : "Aún no hay ventas con seguimiento de cobro. Registra una venta en el módulo Ventas.");
    },
    abrirAbono(v) {
      const token = U.id(); const saldo = Dom().saldoVenta(v);
      const dlg = UI.dialogo(`<h3>Registrar abono · ${esc(v.numero)}</h3><p class="dlg-texto">Cliente: ${esc(v.clienteNombre || "Sin cliente")}\nSaldo pendiente: ${U.dinero(saldo)}</p>
        <form id="abForm" class="form-grid1"><label>Valor recibido (COP) *<input id="abValor" type="number" min="1" max="${saldo}" step="1" value="${saldo}" required></label>
        <label>Fecha<input id="abFecha" type="date" value="${U.hoy()}" min="${esc(v.fecha)}" required></label>
        <label>Método de pago<select id="abMetodo">${UI.opciones(Dom().METODOS_PAGO.map((m) => ({ v: m, t: m })), "", "Sin indicar")}</select></label>
        <label>Nota<input id="abNota" maxlength="300" placeholder="Opcional"></label>
        <div class="form-actions"><button id="abOk" class="btn btn-primary" type="submit">Registrar abono</button><button class="btn btn-light" type="button" data-c="1">Cancelar</button></div></form>`);
      dlg.querySelector("[data-c]").addEventListener("click", () => dlg.close());
      dlg.querySelector("#abForm").addEventListener("submit", async (e) => {
        e.preventDefault(); dlg.querySelector("#abOk").disabled = true;
        const r = await UI.intentar(() => Dom().registrarPago(v.id, { token, valor: dlg.querySelector("#abValor").value, fecha: dlg.querySelector("#abFecha").value, metodoPago: dlg.querySelector("#abMetodo").value, nota: dlg.querySelector("#abNota").value }));
        if (r.ok) { dlg.close(); const s = Dom().saldoVenta(r.valor); UI.mensaje(s > 0 ? `Abono registrado. Saldo pendiente de ${r.valor.numero}: ${U.dinero(s)}.` : `Abono registrado. ${r.valor.numero} quedó pagada por completo.`); this.actualizar(); }
        else dlg.querySelector("#abOk").disabled = false;
      });
    },
    detalle(id) {
      const d = Store.leer(); const v = d.ventas.find((x) => x.id === id); if (!v) return;
      const vigente = v.estado === "confirmada";
      const dlg = UI.dialogo(`<h3>Cobros de ${esc(v.numero)}</h3><dl class="detalle"><dt>Cliente</dt><dd>${esc(v.clienteNombre || "Sin cliente")}</dd><dt>Total</dt><dd>${U.dinero(v.total)}</dd><dt>Pagado</dt><dd>${U.dinero(Dom().pagadoVenta(v))}</dd><dt>Saldo</dt><dd><strong>${U.dinero(Dom().saldoVenta(v))}</strong></dd><dt>Estado</dt><dd>${UI.cobroPill(v)}</dd></dl>
        ${UI.tabla([{ t: "Fecha", f: (p) => esc(U.fecha(p.fecha)) }, { t: "Valor", f: (p) => U.dinero(p.valor) }, { t: "Método", f: (p) => esc(p.metodoPago || "—") }, { t: "Nota", f: (p) => esc(p.nota || "—") },
          { t: "Estado", f: (p) => (p.estado === "anulado" ? `Anulado${p.motivoAnulacion ? ": " + esc(p.motivoAnulacion) : ""}` : "Vigente") }, { t: "", f: (p) => (vigente && p.estado !== "anulado" ? `<button class="table-action danger" data-anular="${esc(p.id)}">Anular</button>` : "") }], v.pagos || [], "Todavía no hay abonos registrados.")}
        ${vigente ? `<div class="filters-bar"><label class="inline-field">Fecha de vencimiento<input id="dtVence" type="date" value="${esc(v.vencimiento || "")}"></label><button class="btn btn-light btn-small" data-vence="1" type="button">Guardar vencimiento</button></div>` : ""}
        <div class="form-actions"><button class="btn btn-light" data-x="1">Cerrar</button></div>`, { ancho: "grande" });
      dlg.addEventListener("click", async (e) => {
        if (e.target.closest("[data-x]")) return dlg.close();
        const an = e.target.closest("[data-anular]");
        if (an) {
          const motivo = await UI.pedirTexto("Anular abono", "Motivo de la anulación", { ok: "Anular abono", peligro: true }); if (motivo === null) return;
          if ((await UI.intentar(() => Dom().anularPago(v.id, an.dataset.anular, motivo), "Abono anulado; el saldo pendiente aumentó.")).ok) { dlg.close(); this.actualizar(); this.detalle(v.id); }
        }
        if (e.target.closest("[data-vence]")) { if ((await UI.intentar(() => Dom().cambiarVencimiento(v.id, dlg.querySelector("#dtVence").value), "Vencimiento actualizado.")).ok) { dlg.close(); this.actualizar(); } }
      });
    },
    recordatorio(v) {
      const d = Store.leer(); const cliente = Dom().clienteDe(d, v.clienteId);
      const dlg = UI.dialogo(`<h3>Recordatorio de cobro</h3><p class="dlg-texto">Revisa el mensaje, cópialo o ábrelo en WhatsApp. MINY no envía mensajes por sí sola.</p><textarea id="rcTexto" rows="6">${esc(textoRecordatorio(d, v))}</textarea>
        <div class="form-actions"><button class="btn btn-primary" data-copiar="1" type="button">Copiar</button><button class="btn btn-light" data-wa="1" type="button">Abrir en WhatsApp</button><button class="btn btn-light" data-x="1" type="button">Cerrar</button></div>`);
      dlg.addEventListener("click", async (e) => {
        const t = dlg.querySelector("#rcTexto").value;
        if (e.target.closest("[data-x]")) dlg.close();
        if (e.target.closest("[data-copiar]")) { try { await navigator.clipboard.writeText(t); } catch (err) { dlg.querySelector("#rcTexto").select(); document.execCommand && document.execCommand("copy"); } UI.mensaje("Mensaje copiado."); }
        if (e.target.closest("[data-wa]")) {
          const dig = String((cliente && cliente.telefono) || "").replace(/\D/g, "");
          const directo = d.config.moneda === "COP" && dig.length === 10 && dig[0] === "3";
          window.open(`https://wa.me/${directo ? "57" + dig : ""}?text=${encodeURIComponent(t)}`, "_blank", "noopener");
        }
      });
    },
    accion(e) {
      const d = Store.leer();
      const g = (a) => { const b = e.target.closest(`[data-${a}]`); return b ? d.ventas.find((x) => x.id === b.dataset[a]) : null; };
      const ab = g("abonar"), de = g("detalle"), re = g("recordar");
      if (ab) this.abrirAbono(ab);
      if (de) this.detalle(de.id);
      if (re) this.recordatorio(re);
    }
  };
})(window);
