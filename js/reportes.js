"use strict";
/*
 * MINY Logistics · REPORTES e INDICADORES DEL INICIO
 * Todo se calcula con los registros reales; si no hay datos, los resultados quedan en cero o vacíos.
 */
(function (global) {
  const { U } = global.MINY;
  const D = () => global.MINY.Dominio;

  /* ---------- Períodos ---------- */
  function rangoPeriodo(clave) {
    const hoy = U.hoy();
    const base = new Date(hoy + "T00:00:00");
    const iso = (d) => U.fechaDeDate(d);
    if (clave === "hoy") return { desde: hoy, hasta: hoy };
    if (clave === "7d") { const d = new Date(base); d.setDate(d.getDate() - 6); return { desde: iso(d), hasta: hoy }; }
    if (clave === "30d") { const d = new Date(base); d.setDate(d.getDate() - 29); return { desde: iso(d), hasta: hoy }; }
    if (clave === "mes") return { desde: hoy.slice(0, 8) + "01", hasta: hoy };
    if (clave === "anio") return { desde: hoy.slice(0, 4) + "-01-01", hasta: hoy };
    return { desde: "", hasta: "" };
  }

  /* ---------- Panel de inicio ---------- */
  function resumenInicio(d, periodo) {
    const f = rangoPeriodo(periodo);
    const productos = d.productos;
    const activos = productos.filter((p) => p.activo !== false);
    const bajos = activos.filter((p) => D().nivelStock(p) === "bajo");
    const agotados = activos.filter((p) => D().nivelStock(p) === "agotado");
    const ventasPeriodo = d.ventas.filter((v) => v.estado === "confirmada" && D().enRango(v.fecha, f));
    const libro = D().libroFinanzas(d, f);
    const fin = D().resumenFinanzas(libro);
    const pedidosPend = d.pedidos.filter((o) => ["pendiente", "confirmado"].includes(o.estado));
    const pedidosProc = d.pedidos.filter((o) => ["en_preparacion", "listo"].includes(o.estado));
    const comprasPend = d.compras.filter((c) => ["pendiente", "parcial"].includes(c.estado));
    const eventos = [];
    d.ventas.forEach((v) => eventos.push({ ts: v.creado || v.fecha || "", texto: `${v.estado === "anulada" ? "Venta anulada" : "Venta"} ${v.numero} · ${U.dinero(v.total)}` }));
    d.pedidos.forEach((o) => eventos.push({ ts: o.actualizado || o.creado || o.fecha || "", texto: `Pedido ${o.numero} · ${D().ESTADOS_PEDIDO[o.estado]} · ${o.clienteNombre}` }));
    d.compras.forEach((c) => (c.recepciones || []).forEach((r) => eventos.push({ ts: r.creado || r.fecha, texto: `Recepción de compra ${c.numero} · ${U.dinero(r.valor)}` })));
    d.movimientos.filter((m) => ["entrada", "salida", "ajuste_positivo", "ajuste_negativo", "reversion"].includes(m.tipo)).forEach((m) => eventos.push({ ts: m.creado || m.fecha || "", texto: `${D().TIPOS_MOV[m.tipo].etiqueta}: ${m.producto} (${m.delta > 0 ? "+" : ""}${m.delta})` }));
    eventos.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    return {
      periodo: f,
      productosTotal: productos.length, productosActivos: activos.length,
      unidades: U.suma(productos, (p) => p.cantidad),
      bajos, agotados,
      valorCosto: U.suma(productos, (p) => p.cantidad * p.costo),
      valorVenta: U.suma(productos, (p) => p.cantidad * p.precio),
      ventasCantidad: ventasPeriodo.length, ventasTotal: U.suma(ventasPeriodo, (v) => v.total),
      pedidosPendientes: pedidosPend.length, pedidosEnProceso: pedidosProc.length,
      comprasPendientes: comprasPend.length,
      cartera: D().resumenCartera(d),
      ingresos: fin.ingresos, egresos: fin.egresos, neto: fin.neto,
      actividad: eventos.slice(0, 8),
      sinDatos: !productos.length && !d.ventas.length && !d.pedidos.length && !d.compras.length && !d.finanzas.length
    };
  }

  /* ---------- Reportes ---------- */
  const TIPOS_REPORTE = {
    productos: { titulo: "Productos y existencias", filtros: ["categoria", "productoId"] },
    inventario_bajo: { titulo: "Inventario bajo y agotado", filtros: ["categoria"] },
    movimientos: { titulo: "Historial de movimientos de inventario", filtros: ["fechas", "productoId", "categoria"] },
    ventas: { titulo: "Ventas por período", filtros: ["fechas", "clienteId", "productoId", "categoria"] },
    mas_vendidos: { titulo: "Productos más vendidos", filtros: ["fechas", "clienteId", "categoria"] },
    pedidos_estado: { titulo: "Pedidos por estado", filtros: ["fechas", "clienteId"] },
    compras_proveedor: { titulo: "Compras por proveedor", filtros: ["fechas", "proveedorId"] },
    cartera: { titulo: "Cuentas por cobrar (cartera)", filtros: ["fechas", "clienteId"] },
    cobros: { titulo: "Cobros recibidos", filtros: ["fechas", "clienteId"] },
    financiero: { titulo: "Ingresos, gastos y resultado", filtros: ["fechas"] }
  };
  const nivelTxt = { agotado: "Agotado", bajo: "Bajo", normal: "Normal" };
  const mesDe = (f) => (f ? f.slice(0, 7) : "Sin fecha");

  function reporte(d, tipo, f = {}) {
    const R = { titulo: (TIPOS_REPORTE[tipo] || {}).titulo || "Reporte", columnas: [], filas: [], resumen: [], grafico: null };
    const catDe = (id) => { const p = D().productoDe(d, id); return p ? p.categoria : ""; };
    const nombreP = (id, snap) => { const p = D().productoDe(d, id); return p ? p.nombre : snap || "Producto eliminado"; };
    const codigoP = (id, snap) => { const p = D().productoDe(d, id); return p ? p.codigo : snap || "—"; };

    if (tipo === "productos" || tipo === "inventario_bajo") {
      let lista = d.productos.filter((p) => (!f.categoria || p.categoria === f.categoria) && (!f.productoId || p.id === f.productoId));
      if (tipo === "inventario_bajo") lista = lista.filter((p) => p.activo !== false && D().nivelStock(p) !== "normal");
      R.columnas = [
        { k: "nombre", t: "Producto" }, { k: "codigo", t: "SKU" }, { k: "categoria", t: "Categoría" }, { k: "existencias", t: "Existencias", tipo: "entero" },
        { k: "minimo", t: "Mínimo", tipo: "entero" }, { k: "nivel", t: "Nivel" }, { k: "costo", t: "Costo", tipo: "dinero" }, { k: "precio", t: "Precio", tipo: "dinero" },
        { k: "valorCosto", t: "Valor a costo", tipo: "dinero" }, { k: "valorVenta", t: "Valor a precio de venta", tipo: "dinero" }, { k: "estado", t: "Estado" }
      ];
      R.filas = lista.map((p) => ({ nombre: p.nombre, codigo: p.codigo, categoria: p.categoria || "—", existencias: p.cantidad, minimo: p.minimo, nivel: nivelTxt[D().nivelStock(p)], costo: p.costo, precio: p.precio, valorCosto: p.cantidad * p.costo, valorVenta: p.cantidad * p.precio, estado: p.activo === false ? "Inactivo" : "Activo" }))
        .sort((a, b) => (tipo === "inventario_bajo" ? a.existencias - b.existencias : a.nombre.localeCompare(b.nombre, "es")));
      R.resumen = [{ t: "Productos", v: R.filas.length, tipo: "entero" }, { t: "Unidades", v: U.suma(R.filas, (r) => r.existencias), tipo: "entero" }, { t: "Valor a costo", v: U.suma(R.filas, (r) => r.valorCosto), tipo: "dinero" }, { t: "Valor a precio de venta", v: U.suma(R.filas, (r) => r.valorVenta), tipo: "dinero" }];
      if (tipo === "inventario_bajo") R.resumen = [{ t: "Agotados", v: R.filas.filter((r) => r.nivel === "Agotado").length, tipo: "entero" }, { t: "Con inventario bajo", v: R.filas.filter((r) => r.nivel === "Bajo").length, tipo: "entero" }];
    }

    else if (tipo === "movimientos") {
      const lista = d.movimientos.filter((m) => D().enRango(m.fecha, f) && (!f.productoId || m.productoId === f.productoId) && (!f.categoria || catDe(m.productoId) === f.categoria));
      R.columnas = [{ k: "fecha", t: "Fecha", tipo: "fecha" }, { k: "producto", t: "Producto" }, { k: "codigo", t: "SKU" }, { k: "tipo", t: "Movimiento" }, { k: "delta", t: "Cantidad", tipo: "entero" }, { k: "antes", t: "Antes", tipo: "entero" }, { k: "despues", t: "Después", tipo: "entero" }, { k: "documento", t: "Documento" }, { k: "nota", t: "Observaciones" }];
      R.filas = lista.map((m) => ({ fecha: m.fecha, producto: nombreP(m.productoId, m.producto), codigo: codigoP(m.productoId, m.codigo), tipo: (D().TIPOS_MOV[m.tipo] || {}).etiqueta || m.tipo, delta: m.delta, antes: m.antes ?? "", despues: m.despues ?? "", documento: m.origenNumero || "", nota: m.nota || "" }));
      R.resumen = [{ t: "Movimientos", v: lista.length, tipo: "entero" }, { t: "Unidades que entraron", v: U.suma(lista.filter((m) => m.delta > 0), (m) => m.delta), tipo: "entero" }, { t: "Unidades que salieron", v: U.suma(lista.filter((m) => m.delta < 0), (m) => -m.delta), tipo: "entero" }];
    }

    else if (tipo === "ventas") {
      const porLinea = !!(f.productoId || f.categoria);
      const ventas = d.ventas.filter((v) => v.estado === "confirmada" && D().enRango(v.fecha, f) && (!f.clienteId || v.clienteId === f.clienteId));
      if (porLinea) {
        R.columnas = [{ k: "fecha", t: "Fecha", tipo: "fecha" }, { k: "numero", t: "Venta" }, { k: "cliente", t: "Cliente" }, { k: "producto", t: "Producto" }, { k: "cantidad", t: "Cantidad", tipo: "entero" }, { k: "valor", t: "Subtotal de la línea (antes de descuento)", tipo: "dinero" }];
        ventas.forEach((v) => v.items.filter((it) => (!f.productoId || it.productoId === f.productoId) && (!f.categoria || catDe(it.productoId) === f.categoria)).forEach((it) => R.filas.push({ fecha: v.fecha, numero: v.numero, cliente: v.clienteNombre || "Sin cliente", producto: nombreP(it.productoId, it.nombre), cantidad: it.cantidad, valor: it.subtotal })));
        R.resumen = [{ t: "Líneas", v: R.filas.length, tipo: "entero" }, { t: "Unidades", v: U.suma(R.filas, (r) => r.cantidad), tipo: "entero" }, { t: "Subtotal", v: U.suma(R.filas, (r) => r.valor), tipo: "dinero" }];
      } else {
        R.columnas = [{ k: "fecha", t: "Fecha", tipo: "fecha" }, { k: "numero", t: "Venta" }, { k: "cliente", t: "Cliente" }, { k: "unidades", t: "Unidades", tipo: "entero" }, { k: "descuento", t: "Descuento", tipo: "dinero" }, { k: "valor", t: "Total", tipo: "dinero" }, { k: "pago", t: "Pago" }];
        R.filas = ventas.map((v) => ({ fecha: v.fecha, numero: v.numero, cliente: v.clienteNombre || "Sin cliente", unidades: U.suma(v.items, (it) => it.cantidad), descuento: v.descuento, valor: v.total, pago: v.metodoPago || "—" }));
        const total = U.suma(ventas, (v) => v.total);
        R.resumen = [{ t: "Ventas", v: ventas.length, tipo: "entero" }, { t: "Total vendido", v: total, tipo: "dinero" }, { t: "Ticket promedio", v: ventas.length ? Math.round(total / ventas.length) : 0, tipo: "dinero" }];
      }
      const porMes = new Map();
      R.filas.forEach((r) => porMes.set(mesDe(r.fecha), (porMes.get(mesDe(r.fecha)) || 0) + r.valor));
      R.grafico = { titulo: "Ventas por mes", items: [...porMes.entries()].sort().slice(-12).map(([etiqueta, valor]) => ({ etiqueta, valor, texto: U.dinero(valor) })) };
    }

    else if (tipo === "mas_vendidos") {
      const m = new Map();
      d.ventas.filter((v) => v.estado === "confirmada" && D().enRango(v.fecha, f) && (!f.clienteId || v.clienteId === f.clienteId)).forEach((v) => v.items.forEach((it) => {
        if (f.categoria && catDe(it.productoId) !== f.categoria) return;
        const x = m.get(it.productoId) || { producto: nombreP(it.productoId, it.nombre), codigo: codigoP(it.productoId, it.codigo), unidades: 0, ingresos: 0 };
        x.unidades += it.cantidad; x.ingresos += it.subtotal; m.set(it.productoId, x);
      }));
      R.columnas = [{ k: "puesto", t: "#", tipo: "entero" }, { k: "producto", t: "Producto" }, { k: "codigo", t: "SKU" }, { k: "unidades", t: "Unidades vendidas", tipo: "entero" }, { k: "ingresos", t: "Ingresos (antes de descuentos)", tipo: "dinero" }];
      R.filas = [...m.values()].sort((a, b) => b.unidades - a.unidades || b.ingresos - a.ingresos).slice(0, 20).map((x, i) => ({ puesto: i + 1, ...x }));
      R.resumen = [{ t: "Productos vendidos", v: m.size, tipo: "entero" }, { t: "Unidades", v: U.suma([...m.values()], (x) => x.unidades), tipo: "entero" }];
      R.grafico = { titulo: "Unidades vendidas (top 10)", items: R.filas.slice(0, 10).map((r) => ({ etiqueta: r.producto, valor: r.unidades, texto: String(r.unidades) })) };
    }

    else if (tipo === "pedidos_estado") {
      const lista = d.pedidos.filter((o) => D().enRango(o.fecha, f) && (!f.clienteId || o.clienteId === f.clienteId));
      R.columnas = [{ k: "estado", t: "Estado" }, { k: "cantidad", t: "Pedidos", tipo: "entero" }, { k: "valor", t: "Valor", tipo: "dinero" }];
      R.filas = Object.keys(D().ESTADOS_PEDIDO).map((e) => { const l = lista.filter((o) => o.estado === e); return { estado: D().ESTADOS_PEDIDO[e], cantidad: l.length, valor: U.suma(l, (o) => o.total) }; });
      R.resumen = [{ t: "Pedidos", v: lista.length, tipo: "entero" }, { t: "Valor total", v: U.suma(lista, (o) => o.total), tipo: "dinero" }];
      R.grafico = { titulo: "Pedidos por estado", items: R.filas.map((r) => ({ etiqueta: r.estado, valor: r.cantidad, texto: String(r.cantidad) })) };
      if (!lista.length) R.filas = [];
    }

    else if (tipo === "compras_proveedor") {
      const compras = d.compras.filter((c) => c.estado !== "cancelada" && D().enRango(c.fecha, f) && (!f.proveedorId || c.proveedorId === f.proveedorId));
      const m = new Map();
      compras.forEach((c) => {
        const x = m.get(c.proveedorId) || { proveedor: (D().proveedorDe(d, c.proveedorId) || {}).nombre || c.proveedorNombre, compras: 0, ordenado: 0, recibido: 0 };
        x.compras++; x.ordenado += c.total; x.recibido += U.suma(c.recepciones || [], (r) => r.valor); m.set(c.proveedorId, x);
      });
      R.columnas = [{ k: "proveedor", t: "Proveedor" }, { k: "compras", t: "Compras", tipo: "entero" }, { k: "ordenado", t: "Valor ordenado", tipo: "dinero" }, { k: "recibido", t: "Valor recibido", tipo: "dinero" }];
      R.filas = [...m.values()].sort((a, b) => b.ordenado - a.ordenado);
      R.resumen = [{ t: "Compras (sin canceladas)", v: compras.length, tipo: "entero" }, { t: "Valor ordenado", v: U.suma(R.filas, (r) => r.ordenado), tipo: "dinero" }, { t: "Valor recibido", v: U.suma(R.filas, (r) => r.recibido), tipo: "dinero" }];
      R.grafico = { titulo: "Valor ordenado por proveedor", items: R.filas.slice(0, 10).map((r) => ({ etiqueta: r.proveedor, valor: r.ordenado, texto: U.dinero(r.ordenado) })) };
    }

    else if (tipo === "cartera") {
      const lista = D().cartera(d, f);
      R.columnas = [{ k: "numero", t: "Venta" }, { k: "fecha", t: "Fecha", tipo: "fecha" }, { k: "cliente", t: "Cliente" }, { k: "total", t: "Total", tipo: "dinero" }, { k: "pagado", t: "Pagado", tipo: "dinero" }, { k: "saldo", t: "Saldo", tipo: "dinero" }, { k: "vence", t: "Vence", tipo: "fecha" }, { k: "estado", t: "Estado" }, { k: "dias", t: "Días de atraso", tipo: "entero" }];
      R.filas = lista.map((x) => ({ numero: x.venta.numero, fecha: x.venta.fecha, cliente: x.venta.clienteNombre || "Sin cliente", total: x.venta.total, pagado: x.pagado, saldo: x.saldo, vence: x.venta.vencimiento || "", estado: x.vencida ? "Vencida" : D().ESTADOS_COBRO[D().estadoCobro(x.venta)], dias: x.dias }));
      const rc = D().resumenCartera({ ...d, ventas: lista.map((x) => x.venta) });
      R.resumen = [{ t: "Por cobrar", v: rc.total, tipo: "dinero" }, { t: "Vencido", v: rc.vencido, tipo: "dinero" }, { t: "Ventas con saldo", v: rc.cantidad, tipo: "entero" }, { t: "Ventas vencidas", v: rc.vencidas, tipo: "entero" }];
      R.grafico = { titulo: "Saldo por cliente (top 10)", items: rc.porCliente.slice(0, 10).map((c) => ({ etiqueta: c.cliente, valor: c.saldo, texto: U.dinero(c.saldo) })) };
    }

    else if (tipo === "cobros") {
      const filas = D().libroFinanzas(d, f).filter((r) => r.origen === "cobro" && (!f.clienteId || r.clienteId === f.clienteId));
      R.columnas = [{ k: "fecha", t: "Fecha", tipo: "fecha" }, { k: "concepto", t: "Concepto" }, { k: "metodo", t: "Método de pago" }, { k: "valor", t: "Valor cobrado", tipo: "dinero" }];
      R.filas = filas.map((r) => ({ fecha: r.fecha, concepto: r.concepto, metodo: r.metodoPago || "Sin indicar", valor: r.valor }));
      R.resumen = [{ t: "Total cobrado", v: U.suma(filas, (r) => r.valor), tipo: "dinero" }, { t: "Cobros", v: filas.length, tipo: "entero" }];
      const porMetodo = new Map(); R.filas.forEach((r) => porMetodo.set(r.metodo, (porMetodo.get(r.metodo) || 0) + r.valor));
      R.grafico = { titulo: "Cobrado por método de pago", items: [...porMetodo.entries()].sort((a, b) => b[1] - a[1]).map(([etiqueta, valor]) => ({ etiqueta, valor, texto: U.dinero(valor) })) };
    }

    else if (tipo === "financiero") {
      const libro = D().libroFinanzas(d, f);
      const fin = D().resumenFinanzas(libro);
      R.columnas = [{ k: "mes", t: "Mes" }, { k: "ingresos", t: "Ingresos", tipo: "dinero" }, { k: "egresos", t: "Gastos y compras", tipo: "dinero" }, { k: "neto", t: "Resultado", tipo: "dinero" }];
      R.filas = D().resumenMensual(libro);
      R.resumen = [{ t: "Ingresos", v: fin.ingresos, tipo: "dinero" }, { t: "Gastos y compras", v: fin.egresos, tipo: "dinero" }, { t: "Resultado calculado", v: fin.neto, tipo: "dinero" }];
      R.grafico = { titulo: "Resultado por mes", items: R.filas.slice(-12).map((r) => ({ etiqueta: r.mes, valor: Math.abs(r.neto), texto: U.dinero(r.neto), negativo: r.neto < 0 })) };
    }
    R.vacio = R.filas.length === 0;
    return R;
  }

  function aCSV(R) {
    return U.csv(R.columnas, R.filas);
  }

  global.MINY.Reportes = { rangoPeriodo, resumenInicio, reporte, aCSV, TIPOS_REPORTE };
})(typeof window !== "undefined" ? window : globalThis);
