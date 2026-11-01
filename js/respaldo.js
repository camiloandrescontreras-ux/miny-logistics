"use strict";
/*
 * MINY Logistics · RESPALDO Y RESTAURACIÓN
 * Formato v3: { app, formato:"MINY-backup", version:3, versionApp, fechaExportacion, datos:{...} }
 * También se aceptan los respaldos de la versión anterior (listas al nivel superior) y se migran.
 */
(function (global) {
  const { KEYS, LISTAS, U, Store, ErrorNegocio, VERSION_DATOS, VERSION_APP } = global.MINY;

  function exportar() {
    const d = Store.leer();
    const datos = {};
    LISTAS.forEach((n) => { datos[n] = d[n]; });
    datos.config = d.config;
    return { app: "MINY Logistics", formato: "MINY-backup", version: VERSION_DATOS, versionApp: VERSION_APP, fechaExportacion: U.ahora(), datos };
  }
  /** Marca la fecha del último respaldo descargado. */
  function marcarExportado() {
    Store.transaccion((d) => { d.config.ultimoRespaldo = U.ahora(); });
  }

  const esObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  const num = (x) => typeof x === "number" && Number.isFinite(x);

  /** Devuelve { ok, errores[], tipo, datos (ya en formato v3), resumen }. No modifica nada. */
  function validar(obj) {
    const errores = [];
    if (!esObj(obj)) return { ok: false, errores: ["El archivo no contiene un objeto JSON válido."] };
    let tipo, origen;
    if (obj.formato === "MINY-backup") {
      if (!num(obj.version) || obj.version > VERSION_DATOS) errores.push(`La versión del respaldo (${obj.version}) no es compatible con esta aplicación (máx. ${VERSION_DATOS}).`);
      if (!esObj(obj.datos)) errores.push('Falta la sección "datos".');
      tipo = "v3"; origen = obj.datos || {};
    } else if (["productos", "movimientos", "ventas", "pedidos", "finanzas"].every((k) => Array.isArray(obj[k]))) {
      tipo = "v2"; origen = obj;
    } else {
      return { ok: false, errores: ["El archivo no corresponde a un respaldo de MINY Logistics (formato no reconocido)."] };
    }
    if (errores.length) return { ok: false, errores };

    const requeridas = tipo === "v3" ? LISTAS : ["productos", "movimientos", "ventas", "pedidos", "finanzas"];
    requeridas.forEach((n) => { if (!Array.isArray(origen[n])) errores.push(`Falta la lista "${n}" o está dañada.`); });
    if (errores.length) return { ok: false, errores };

    const cada = (lista, nombre, regla) => {
      origen[lista].forEach((x, i) => {
        if (!esObj(x)) { errores.push(`${nombre} #${i + 1}: registro inválido.`); return; }
        if (tipo === "v3" && (typeof x.id !== "string" || !x.id)) { errores.push(`${nombre} #${i + 1}: sin identificador.`); return; }
        const r = regla(x); if (r) errores.push(`${nombre} #${i + 1}: ${r}`);
      });
    };
    cada("productos", "Producto", (p) => (typeof p.nombre !== "string" ? "falta el nombre" : !num(Number(p.cantidad)) || Number(p.cantidad) < 0 ? "existencias inválidas" : null));
    cada("movimientos", "Movimiento", (m) => (!num(Number(m.cantidad)) ? "cantidad inválida" : null));
    if (tipo === "v3") {
      cada("ventas", "Venta", (v) => (!Array.isArray(v.items) || !num(v.total) ? "estructura inválida" : v.pagos !== undefined && (!Array.isArray(v.pagos) || v.pagos.some((p) => !esObj(p) || !num(p.valor) || p.valor < 1 || typeof p.fecha !== "string")) ? "abonos inválidos" : null));
      cada("pedidos", "Pedido", (o) => (!Array.isArray(o.items) || !num(o.total) ? "estructura inválida" : null));
      cada("compras", "Compra", (c) => (!Array.isArray(c.items) || !Array.isArray(c.recepciones) || !num(c.total) ? "estructura inválida" : null));
      cada("clientes", "Cliente", (c) => (typeof c.nombre !== "string" ? "falta el nombre" : null));
      cada("proveedores", "Proveedor", (c) => (typeof c.nombre !== "string" ? "falta el nombre" : null));
      cada("finanzas", "Movimiento financiero", (f) => (!["ingreso", "egreso"].includes(f.tipo) || !num(f.valor) ? "estructura inválida" : null));
      if (!errores.length) {
        const prods = new Set(origen.productos.map((p) => p.id));
        const sinProd = (lista, nombre) => origen[lista].forEach((x) => (x.items || []).forEach((it) => { if (!prods.has(it.productoId)) errores.push(`${nombre} ${x.numero || x.id}: hace referencia a un producto que no está en el respaldo.`); }));
        sinProd("ventas", "Venta"); sinProd("pedidos", "Pedido"); sinProd("compras", "Compra");
        origen.movimientos.forEach((m) => { if (!prods.has(m.productoId)) errores.push("Hay movimientos de inventario de un producto que no está en el respaldo."); });
        const ids = new Set(origen.clientes.map((c) => c.id));
        origen.ventas.forEach((v) => { if (v.clienteId && !ids.has(v.clienteId)) errores.push(`Venta ${v.numero}: cliente inexistente en el respaldo.`); });
      }
    }
    if (errores.length) return { ok: false, errores: [...new Set(errores)].slice(0, 12) };

    let datos;
    if (tipo === "v2") datos = global.MINY.Migracion.aV3(origen).datos;
    else {
      datos = {};
      LISTAS.forEach((n) => { datos[n] = origen[n]; });
      const base = global.MINY.clon(global.MINY.CONFIG_DEFECTO);
      datos.config = { ...base, ...(esObj(origen.config) ? origen.config : {}) };
      datos.config.consecutivos = { ...base.consecutivos, ...((origen.config || {}).consecutivos || {}) };
    }
    // Los consecutivos nunca pueden quedar por debajo de los números ya existentes.
    const maxNum = (lista) => lista.reduce((m, x) => { const r = /-(\d+)$/.exec(x.numero || ""); return r ? Math.max(m, +r[1]) : m; }, 0);
    datos.config.consecutivos.venta = Math.max(datos.config.consecutivos.venta || 0, maxNum(datos.ventas));
    datos.config.consecutivos.pedido = Math.max(datos.config.consecutivos.pedido || 0, maxNum(datos.pedidos));
    datos.config.consecutivos.compra = Math.max(datos.config.consecutivos.compra || 0, maxNum(datos.compras));
    const resumen = {}; LISTAS.forEach((n) => { resumen[n] = datos[n].length; });
    return { ok: true, errores: [], tipo, datos, resumen, fecha: obj.fechaExportacion || null };
  }

  /** Reemplaza TODOS los datos actuales por los del respaldo (ya validado). */
  function restaurar(validacion) {
    if (!validacion || !validacion.ok) throw new ErrorNegocio("El respaldo no es válido.");
    const copia = Store.copiaSeguridad(KEYS.copiaRestauracion);
    Store.transaccion((d) => {
      LISTAS.forEach((n) => { d[n] = validacion.datos[n]; });
      d.config = validacion.datos.config;
    });
    Store.fijarVersion(VERSION_DATOS);
    return { copiaPrevia: copia };
  }

  global.MINY.Respaldo = { exportar, marcarExportado, validar, restaurar };
})(typeof window !== "undefined" ? window : globalThis);
