"use strict";
/*
 * MINY Logistics · MIGRACIÓN
 * Convierte los datos de la versión anterior (v2: una venta/pedido = un solo producto)
 * al formato de la fase 3. Nunca borra el original: antes de migrar guarda una copia
 * en la clave "minyBackupPreMigracion".
 */
(function (global) {
  const { KEYS, LISTAS, U, Store, CONFIG_DEFECTO, clon } = global.MINY;

  const TIPO_MOV = {
    "entrada": "entrada", "salida": "salida", "venta": "venta",
    "inventario inicial": "inventario_inicial",
    "ajuste de entrada": "ajuste_positivo", "ajuste de salida": "ajuste_negativo"
  };
  const ESTADO_PEDIDO = {
    "pendiente": "pendiente", "en preparacion": "en_preparacion", "entregado": "entregado", "cancelado": "cancelado"
  };
  const entero0 = (v) => Math.max(0, Math.round(Number(v) || 0));

  /** Función pura: recibe datos v2 y devuelve datos v3 + informe. */
  function aV3(old) {
    old = old || {};
    const cfg = { ...clon(CONFIG_DEFECTO), ...(old.config || {}) };
    cfg.consecutivos = { ...CONFIG_DEFECTO.consecutivos, ...((old.config || {}).consecutivos || {}) };
    const informe = { productos: 0, movimientos: 0, ventas: 0, pedidos: 0, finanzas: 0, clientesCreados: 0, skuGenerados: 0, ventasFinanzasOmitidas: 0, fechasSinInterpretar: 0 };
    const fechaDe = (t) => { const r = U.parsearFechaAntigua(t); if (!r && t) informe.fechasSinInterpretar++; return r; };

    // Productos
    const usados = new Set();
    let sec = 0;
    const nuevoSku = () => { let s; do { sec++; s = "MIN-" + String(sec).padStart(4, "0"); } while (usados.has(U.normalizar(s))); usados.add(U.normalizar(s)); informe.skuGenerados++; return s; };
    const productos = (old.productos || []).map((p) => {
      let codigo = String(p.codigo || "").trim();
      if (!codigo || usados.has(U.normalizar(codigo))) codigo = nuevoSku(); else usados.add(U.normalizar(codigo));
      const creado = fechaDe(p.creado);
      return {
        id: p.id || U.id(), nombre: String(p.nombre || "Producto sin nombre"), codigo, barras: String(p.barras || ""),
        categoria: String(p.categoria || ""), descripcion: String(p.descripcion || ""), unidad: p.unidad || "unidad",
        costo: entero0(p.costo), precio: entero0(p.precio), cantidad: Math.floor(entero0(p.cantidad)),
        minimo: Number.isInteger(p.minimo) && p.minimo >= 0 ? p.minimo : cfg.minimoDefecto,
        activo: p.activo !== false, proveedorIds: Array.isArray(p.proveedorIds) ? p.proveedorIds : [],
        creado: creado ? creado.iso : null, actualizado: null
      };
    });
    informe.productos = productos.length;
    const porId = new Map(productos.map((p) => [p.id, p]));

    // Movimientos
    const movimientos = (old.movimientos || []).map((m) => {
      const f = fechaDe(m.fecha);
      const delta = (Number.isFinite(+m.despues) && Number.isFinite(+m.antes)) ? (+m.despues - +m.antes) : (/salida|venta/i.test(m.tipo || "") ? -entero0(m.cantidad) : entero0(m.cantidad));
      let tipo = TIPO_MOV[U.normalizar(m.tipo)] || (delta >= 0 ? "entrada" : "salida");
      const p = porId.get(m.productoId);
      return {
        id: m.id || U.id(), fecha: f ? f.fecha : null, creado: f ? f.iso : null, productoId: m.productoId,
        producto: m.producto || (p ? p.nombre : ""), codigo: m.codigo || (p ? p.codigo : ""), tipo,
        cantidad: Math.abs(delta) || entero0(m.cantidad), delta, antes: Number.isFinite(+m.antes) ? +m.antes : null,
        despues: Number.isFinite(+m.despues) ? +m.despues : null, nota: String(m.nota || ""),
        origenTipo: tipo === "venta" ? "venta" : "", origenId: null, origenNumero: "", reversadoPor: null, revierteA: null
      };
    });
    informe.movimientos = movimientos.length;

    // Ventas (la lista antigua está de la más nueva a la más antigua)
    const antiguasVentas = old.ventas || [];
    const ventas = antiguasVentas.map((v, i) => {
      const f = fechaDe(v.fecha);
      const p = porId.get(v.productoId);
      const cantidad = Math.max(1, Math.floor(Number(v.cantidad) || 1));
      const precio = entero0(v.precioUnitario);
      const subtotal = v.subtotal != null ? entero0(v.subtotal) : precio * cantidad;
      const descuento = entero0(v.descuento);
      return {
        id: v.id || U.id(), numero: "V-" + String(antiguasVentas.length - i).padStart(6, "0"), token: null,
        fecha: f ? f.fecha : null, creado: f ? f.iso : null, clienteId: null, clienteNombre: "",
        items: [{ productoId: v.productoId, nombre: v.producto || (p ? p.nombre : ""), codigo: v.codigo || (p ? p.codigo : ""), cantidad, precioUnitario: precio, subtotal }],
        subtotal, descuento, total: v.total != null ? entero0(v.total) : Math.max(0, subtotal - descuento),
        metodoPago: "", observaciones: String(v.detalle || ""), estado: "confirmada", pedidoId: null, migrado: true
      };
    });
    informe.ventas = ventas.length;
    cfg.consecutivos.venta = Math.max(cfg.consecutivos.venta, ventas.length);

    // Pedidos + clientes creados a partir de los nombres usados en pedidos
    const clientes = [];
    const clientePorNombre = new Map();
    const antiguosPedidos = old.pedidos || [];
    const pedidos = antiguosPedidos.map((o, i) => {
      const f = fechaDe(o.fecha);
      const nombre = String(o.cliente || "").trim() || "Cliente sin nombre";
      const clave = U.normalizar(nombre);
      let c = clientePorNombre.get(clave);
      if (!c) {
        const contacto = String(o.contacto || "").trim();
        const esTel = /^[0-9+()\-\s]{7,20}$/.test(contacto);
        c = { id: U.id(), nombre, documento: "", telefono: esTel ? contacto : "", correo: "", direccion: "",
          observaciones: "Creado automáticamente al migrar pedidos de la versión anterior." + (contacto && !esTel ? " Contacto: " + contacto : ""),
          activo: true, creado: f ? f.iso : null };
        clientePorNombre.set(clave, c); clientes.push(c);
      }
      const p = porId.get(o.productoId);
      const cantidad = Math.max(1, Math.floor(Number(o.cantidad) || 1));
      const total = entero0(o.valor);
      const estado = ESTADO_PEDIDO[U.normalizar(o.estado)] || "pendiente";
      return {
        id: o.id || U.id(), numero: "P-" + String(antiguosPedidos.length - i).padStart(6, "0"),
        fecha: f ? f.fecha : null, creado: f ? f.iso : null, clienteId: c.id, clienteNombre: c.nombre,
        items: [{ productoId: o.productoId, nombre: o.producto || (p ? p.nombre : ""), codigo: o.codigo || (p ? p.codigo : ""), cantidad, precioUnitario: Math.round(total / cantidad), subtotal: total }],
        total, estado, observaciones: String(o.detalle || ""), ventaId: null, ventaNumero: "",
        historial: [{ fecha: f ? f.iso : null, de: null, a: estado, nota: "Migrado de la versión anterior" }], migrado: true
      };
    });
    informe.pedidos = pedidos.length;
    informe.clientesCreados = clientes.length;
    cfg.consecutivos.pedido = Math.max(cfg.consecutivos.pedido, pedidos.length);

    // Finanzas: los ingresos con origen "venta" se omiten porque ahora las ventas se leen directamente de Ventas.
    const finanzas = [];
    (old.finanzas || []).forEach((x) => {
      if (x.origen === "venta") { informe.ventasFinanzasOmitidas++; return; }
      const ingreso = x.tipo === "ingreso";
      finanzas.push({
        id: x.id || U.id(), fecha: U.esFechaISO(x.fecha) ? x.fecha : null, tipo: ingreso ? "ingreso" : "egreso",
        concepto: String(x.concepto || "Sin concepto"), valor: entero0(x.valor), categoria: ingreso ? "Otros ingresos" : "Otros gastos",
        metodoPago: "", observaciones: "", origen: "manual", estado: "activo", creado: null, historial: []
      });
    });
    informe.finanzas = finanzas.length;

    return { datos: { productos, movimientos, ventas, pedidos, finanzas, clientes, proveedores: [], compras: [], config: cfg }, informe };
  }

  /** Se ejecuta al abrir la aplicación. Conserva los datos existentes. */
  function iniciar() {
    const st = global.localStorage;
    if (Store.versionDatos() >= global.MINY.VERSION_DATOS) return { migrado: false };
    if (!Store.hayDatosAntiguos() && st.getItem(KEYS.config) === null) { Store.fijarVersion(global.MINY.VERSION_DATOS); return { migrado: false, nuevo: true }; }
    const copiaOk = Store.copiaSeguridad(KEYS.copiaMigracion);
    const antiguo = {};
    ["productos", "movimientos", "ventas", "pedidos", "finanzas"].forEach((n) => {
      const crudo = st.getItem(KEYS[n]);
      if (crudo === null || crudo === "") { antiguo[n] = []; return; }
      let v;
      try { v = JSON.parse(crudo); } catch (e) { throw new global.MINY.ErrorNegocio(`No se pudo migrar: los datos de "${KEYS[n]}" están dañados. No se modificó nada.`, "DANADO"); }
      antiguo[n] = Array.isArray(v) ? v : [];
    });
    const { datos, informe } = aV3(antiguo);
    informe.copiaPrevia = copiaOk;
    Store.transaccion((d) => {
      LISTAS.forEach((n) => { d[n] = datos[n]; });
      d.config = { ...datos.config, ultimaMigracion: { fecha: U.ahora(), informe } };
    });
    Store.fijarVersion(global.MINY.VERSION_DATOS);
    return { migrado: true, informe };
  }

  global.MINY.Migracion = { aV3, iniciar };
})(typeof window !== "undefined" ? window : globalThis);
