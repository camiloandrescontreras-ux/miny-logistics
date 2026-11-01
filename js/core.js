"use strict";
/*
 * MINY Logistics · NÚCLEO
 * Almacenamiento (localStorage) con transacciones, utilidades de formato y configuración.
 * Este archivo NO toca la pantalla: así se puede probar con Node (tests/unit.test.js).
 */
(function (global) {
  const VERSION_APP = "4.0.1";
  const VERSION_DATOS = 3;

  // Las claves originales se conservan para no perder datos de versiones anteriores.
  const KEYS = {
    productos: "minyProductos",
    movimientos: "minyMovimientos",
    ventas: "minyVentas",
    pedidos: "minyPedidos",
    finanzas: "minyFinanzas",
    clientes: "minyClientes",
    proveedores: "minyProveedores",
    compras: "minyCompras",
    config: "minyConfig",
    version: "minyVersionDatos",
    copiaMigracion: "minyBackupPreMigracion",
    copiaRestauracion: "minyBackupPreRestauracion",
    copiaBorrado: "minyBackupPreBorrado"
  };
  const LISTAS = ["productos", "movimientos", "ventas", "pedidos", "finanzas", "clientes", "proveedores", "compras"];

  const MONEDAS = ["COP", "USD", "EUR", "MXN"];
  const FORMATOS_FECHA = ["dd/mm/aaaa", "aaaa-mm-dd", "mm/dd/aaaa"];

  const CONFIG_DEFECTO = {
    negocio: "",
    moneda: "COP",
    minimoDefecto: 3,
    formatoFecha: "dd/mm/aaaa",
    permitirDescuentos: true,
    marketing: { whatsapp: "", instagram: "", ciudad: "" },
    consecutivos: { venta: 0, pedido: 0, compra: 0 },
    ultimoRespaldo: null,
    ultimaMigracion: null
  };

  class ErrorNegocio extends Error {
    constructor(mensaje, codigo) { super(mensaje); this.name = "ErrorNegocio"; this.codigo = codigo || ""; }
  }

  const clon = (x) => JSON.parse(JSON.stringify(x));
  const almacen = () => global.localStorage;

  /* ---------- Utilidades de formato ---------- */
  const U = {
    moneda: "COP",
    formatoFecha: "dd/mm/aaaa",
    _fmt: {},
    id() {
      if (global.crypto && typeof global.crypto.randomUUID === "function") return global.crypto.randomUUID();
      return "id-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2, 10);
    },
    /** Fecha local YYYY-MM-DD (no UTC: evita que de noche se registre el día siguiente). */
    hoy() {
      const d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    },
    ahora() { return new Date().toISOString(); },
    esFechaISO(t) {
      if (typeof t !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
      const d = new Date(t + "T00:00:00");
      return !isNaN(d.getTime()) && U.fechaDeDate(d) === t;
    },
    fechaDeDate(d) {
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    },
    /** Muestra una fecha (YYYY-MM-DD o ISO completo) con el formato elegido en Configuración. */
    fecha(valor) {
      if (!valor) return "—";
      const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return String(valor);
      if (U.formatoFecha === "aaaa-mm-dd") return `${m[1]}-${m[2]}-${m[3]}`;
      if (U.formatoFecha === "mm/dd/aaaa") return `${m[2]}/${m[3]}/${m[1]}`;
      return `${m[3]}/${m[2]}/${m[1]}`;
    },
    fechaHora(iso) {
      if (!iso) return "—";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return U.fecha(U.fechaDeDate(d)) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    },
    dinero(valor) {
      const n = Number(valor) || 0;
      const k = U.moneda;
      if (!U._fmt[k]) U._fmt[k] = new Intl.NumberFormat("es-CO", { style: "currency", currency: k, maximumFractionDigits: 0 });
      return U._fmt[k].format(n);
    },
    numero(v) { return Number(v) || 0; },
    esc(valor) {
      return String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    },
    /** Minúsculas y sin tildes: para buscar "camion" y encontrar "Camión". */
    normalizar(t) {
      return String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CO").trim();
    },
    suma(lista, f) { return lista.reduce((s, x) => s + (Number(f(x)) || 0), 0); },
    /** Convierte textos como "23/10/2026, 6:34:00 p. m." (formato de la versión anterior). */
    parsearFechaAntigua(texto) {
      if (!texto) return null;
      const s = String(texto).replace(/[\u00a0\u202f]/g, " ");
      let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const f = `${m[1]}-${m[2]}-${m[3]}`;
        return U.esFechaISO(f) ? { fecha: f, iso: /T/.test(s) && !isNaN(new Date(s)) ? new Date(s).toISOString() : f + "T12:00:00.000Z" } : null;
      }
      m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (!m) return null;
      const dia = +m[1], mes = +m[2], anio = +m[3];
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
      let h = 0, mi = 0, sg = 0;
      const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (t) { h = +t[1]; mi = +t[2]; sg = +(t[3] || 0); }
      const ampm = s.match(/([ap])\.?\s*m/i);
      if (ampm) { const pm = ampm[1].toLowerCase() === "p"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
      const d = new Date(anio, mes - 1, dia, h, mi, sg);
      if (isNaN(d.getTime())) return null;
      return { fecha: U.fechaDeDate(d), iso: d.toISOString() };
    },
    csvCelda(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; },
    /** Genera CSV con ";" (el que abre Excel en configuración regional colombiana). */
    csv(columnas, filas) {
      const cab = columnas.map((c) => U.csvCelda(c.t)).join(";");
      const cuerpo = filas.map((f) => columnas.map((c) => U.csvCelda(f[c.k])).join(";"));
      return [cab, ...cuerpo].join("\r\n");
    }
  };

  /* ---------- Almacenamiento ---------- */
  function leerLista(clave) {
    const crudo = almacen().getItem(clave);
    if (crudo === null || crudo === "") return [];
    let valor;
    try { valor = JSON.parse(crudo); }
    catch (e) { throw new ErrorNegocio(`Los datos guardados en "${clave}" están dañados. No se modificará nada para no perderlos. Restaura un respaldo.`, "DANADO"); }
    return Array.isArray(valor) ? valor : [];
  }
  function leerConfig() {
    const crudo = almacen().getItem(KEYS.config);
    let guardada = {};
    if (crudo) {
      try { guardada = JSON.parse(crudo) || {}; }
      catch (e) { throw new ErrorNegocio("La configuración guardada está dañada. Restaura un respaldo.", "DANADO"); }
    }
    const cfg = { ...clon(CONFIG_DEFECTO), ...guardada };
    cfg.consecutivos = { ...CONFIG_DEFECTO.consecutivos, ...(guardada.consecutivos || {}) };
    return cfg;
  }
  function aplicarConfigVisual(cfg) { U.moneda = cfg.moneda; U.formatoFecha = cfg.formatoFecha; }

  const Store = {
    /** Lee todas las listas y la configuración (no modifica nada). */
    leer() {
      const d = {};
      LISTAS.forEach((n) => { d[n] = leerLista(KEYS[n]); });
      d.config = leerConfig();
      aplicarConfigVisual(d.config);
      return d;
    },
    versionDatos() { return Number(almacen().getItem(KEYS.version)) || 0; },
    fijarVersion(n) { almacen().setItem(KEYS.version, String(n)); },
    hayDatosAntiguos() { return LISTAS.some((n) => almacen().getItem(KEYS[n]) !== null); },
    /**
     * Ejecuta fn(datos) sobre una copia. Si fn lanza un error, no se guarda NADA.
     * Si falla la escritura, se restauran los valores anteriores (sin actualizaciones parciales).
     */
    transaccion(fn) {
      const st = almacen();
      const d = Store.leer();
      const nombres = [...LISTAS, "config"];
      const antes = {}, crudo = {};
      nombres.forEach((n) => { antes[n] = JSON.stringify(d[n]); crudo[n] = st.getItem(KEYS[n]); });
      const resultado = fn(d);
      const escritos = [];
      try {
        nombres.forEach((n) => {
          const s = JSON.stringify(d[n]);
          if (s !== antes[n]) { st.setItem(KEYS[n], s); escritos.push(n); }
        });
      } catch (e) {
        escritos.forEach((n) => { if (crudo[n] === null) st.removeItem(KEYS[n]); else st.setItem(KEYS[n], crudo[n]); });
        throw new ErrorNegocio("No se pudieron guardar los datos (¿almacenamiento lleno?). No se aplicó ningún cambio. Descarga un respaldo y libera espacio.", "ALMACENAMIENTO");
      }
      aplicarConfigVisual(d.config);
      return resultado;
    },
    /** Copia temporal del estado actual (mejor esfuerzo, una sola copia por clave). */
    copiaSeguridad(claveDestino) {
      try {
        const copia = {};
        [...LISTAS, "config"].forEach((n) => { copia[n] = almacen().getItem(KEYS[n]); });
        almacen().setItem(claveDestino, JSON.stringify({ fecha: U.ahora(), datos: copia }));
        return true;
      } catch (e) { return false; }
    },
    usoAlmacenamiento() {
      let bytes = 0;
      Object.values(KEYS).forEach((k) => { const v = almacen().getItem(k); if (v) bytes += (k.length + v.length) * 2; });
      return bytes;
    },
    borrarTodo() {
      Store.copiaSeguridad(KEYS.copiaBorrado);
      [...LISTAS, "config"].forEach((n) => almacen().removeItem(KEYS[n]));
      Store.fijarVersion(VERSION_DATOS);
    }
  };

  global.MINY = global.MINY || {};
  Object.assign(global.MINY, { VERSION_APP, VERSION_DATOS, KEYS, LISTAS, MONEDAS, FORMATOS_FECHA, CONFIG_DEFECTO, ErrorNegocio, U, Store, clon });
})(typeof window !== "undefined" ? window : globalThis);
