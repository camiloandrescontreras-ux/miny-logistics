"use strict";
/*
 * MINY Logistics · NUBE (fase 4)
 * Conexión con Supabase: inicio de sesión, carga de los datos del negocio y traducción de errores.
 * Los datos se descargan a una copia en memoria con la MISMA forma que usaba la versión local,
 * así las pantallas y los reportes siguen funcionando igual. Todo lo que modifica datos pasa por
 * nube-acciones.js (funciones del servidor), nunca se escribe directamente en el navegador.
 */
(function (global) {
  const { U, Store, ErrorNegocio } = global.MINY;
  const nz = (v) => (v === null || v === undefined ? "" : v);
  const num = (v) => (v === null || v === undefined ? 0 : Number(v));

  /* ---------- Traducción de errores ---------- */
  function traducirError(err) {
    if (err instanceof ErrorNegocio) return err;
    const msg = String((err && err.message) || err || "Error desconocido");
    const code = err && err.code;
    const detalle = msg + " " + String((err && err.details) || "");
    const tabla = [
      [/productos_sku_uq/, "Ese SKU ya está asignado a otro producto."],
      [/productos_barras_uq/, "Ese código de barras ya está asignado a otro producto."],
      [/clientes_documento_uq/, "Ya existe un cliente con ese documento."],
      [/proveedores_ident_uq/, "Ya existe un proveedor con esa identificación."],
      [/(clientes|proveedores)_correo_check/, "El correo electrónico no tiene un formato válido."],
      [/(clientes|proveedores)_telefono_check/, "El teléfono solo puede tener números, espacios, + ( ) - y entre 7 y 20 caracteres."],
      [/marketing_whatsapp/, "El WhatsApp solo puede tener números, espacios, + ( ) - (entre 7 y 20 caracteres)."],
      [/movimientos_financieros_valor_check/, "El importe debe ser un entero mayor que cero."],
      [/productos_(costo|precio|minimo)_check/, "El costo, el precio y el mínimo deben ser enteros mayores o iguales a cero."],
      [/invalid input syntax for type (bigint|integer|uuid|date)/i, "Revisa los datos: usa números enteros y fechas válidas."],
      [/JWT expired|invalid JWT|not authenticated|Auth session missing/i, "Tu sesión expiró. Vuelve a iniciar sesión."],
      [/Failed to fetch|NetworkError|Load failed|network request failed/i, "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo."],
      [/violates foreign key constraint/i, "No se puede completar: este registro tiene información relacionada (historial)."],
      [/row-level security|permission denied/i, "No tienes permiso para esta acción."]
    ];
    for (const [re, txt] of tabla) if (re.test(detalle)) return new ErrorNegocio(txt, code);
    if (code === "23505") return new ErrorNegocio("Ya existe un registro con esos datos.", code);
    return new ErrorNegocio(msg, code);   // los mensajes de las funciones del servidor ya vienen en español
  }
  function traducirAuth(err) {
    const msg = String((err && err.message) || err || "");
    if (/Invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
    if (/Email not confirmed/i.test(msg)) return "Debes confirmar tu correo antes de entrar. Revisa tu bandeja de entrada y la carpeta de spam.";
    if (/already registered|already been registered/i.test(msg)) return "Ese correo ya está registrado. Inicia sesión.";
    if (/Password should be at least|weak password/i.test(msg)) return "La contraseña es muy débil o muy corta. Usa al menos 8 caracteres.";
    if (/rate limit|too many/i.test(msg)) return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
    if (/valid email|invalid email/i.test(msg)) return "Escribe un correo electrónico válido.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "No hay conexión con el servidor. Revisa tu internet.";
    return msg || "No se pudo completar la operación.";
  }

  /* ---------- Conversión de filas de la base de datos a la forma que usan las pantallas ---------- */
  function agrupar(filas, clave) {
    const m = new Map();
    filas.forEach((f) => { const k = f[clave]; if (!m.has(k)) m.set(k, []); m.get(k).push(f); });
    return m;
  }
  function mapear(r) {
    const provPorProducto = agrupar(r.producto_proveedores, "producto_id");
    const mkPorProducto = new Map(r.producto_marketing.map((m) => [m.producto_id, m]));
    const fotosOrdenadas = r.producto_fotos.slice().sort((a, b) => a.orden - b.orden);
    const fotosPorProducto = agrupar(fotosOrdenadas, "producto_id");
    const fotos = {};
    r.producto_fotos.forEach((f) => { fotos[f.id] = f.ruta; });

    const productos = r.productos.map((p) => {
      const m = mkPorProducto.get(p.id);
      return {
        id: p.id, nombre: p.nombre, codigo: p.sku, barras: nz(p.barras), categoria: nz(p.categoria), descripcion: nz(p.descripcion),
        unidad: p.unidad, costo: num(p.costo), precio: num(p.precio), cantidad: num(p.cantidad), minimo: num(p.minimo), activo: p.activo !== false,
        proveedorIds: (provPorProducto.get(p.id) || []).map((x) => x.proveedor_id), creado: p.created_at, actualizado: p.updated_at,
        marketing: {
          existe: !!m, fotoIds: (fotosPorProducto.get(p.id) || []).map((f) => f.id),
          caracteristicas: nz(m && m.caracteristicas), publico: nz(m && m.publico), oferta: nz(m && m.oferta),
          cta: (m && m.cta) || "whatsapp", tono: (m && m.tono) || "cercano", variante: m ? num(m.variante) : 0, textos: (m && m.textos) || null
        }
      };
    });

    const movimientos = r.movimientos_inventario.map((m) => ({
      id: m.id, fecha: m.fecha, creado: m.created_at, productoId: m.producto_id, producto: nz(m.producto), codigo: nz(m.codigo), tipo: m.tipo,
      cantidad: num(m.cantidad), delta: num(m.delta), antes: num(m.antes), despues: num(m.despues), nota: nz(m.nota),
      origenTipo: nz(m.origen_tipo), origenId: m.origen_id || null, origenNumero: nz(m.origen_numero), reversadoPor: m.reversado_por || null, revierteA: m.revierte_a || null
    }));

    const itemsVenta = agrupar(r.venta_items, "venta_id");
    const pagosVenta = agrupar(r.venta_pagos, "venta_id");
    const ventas = r.ventas.map((v) => ({
      id: v.id, numero: v.numero, token: v.token || null, fecha: v.fecha, creado: v.created_at, clienteId: v.cliente_id || null, clienteNombre: nz(v.cliente_nombre),
      items: (itemsVenta.get(v.id) || []).map((i) => ({ productoId: i.producto_id, nombre: i.nombre, codigo: nz(i.codigo), cantidad: num(i.cantidad), precioUnitario: num(i.precio_unitario), subtotal: num(i.subtotal) })),
      subtotal: num(v.subtotal), descuento: num(v.descuento), total: num(v.total), metodoPago: nz(v.metodo_pago), observaciones: nz(v.observaciones), estado: v.estado,
      pedidoId: v.pedido_id || null, condicion: v.condicion, vencimiento: nz(v.vencimiento), motivoAnulacion: nz(v.motivo_anulacion),
      pagos: (pagosVenta.get(v.id) || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((g) => ({
        id: g.id, token: g.token || null, fecha: g.fecha, valor: num(g.valor), metodoPago: nz(g.metodo_pago), nota: nz(g.nota), creado: g.created_at, estado: g.estado, motivoAnulacion: nz(g.motivo_anulacion)
      }))
    }));
    const numeroVenta = new Map(ventas.map((v) => [v.id, v.numero]));

    const itemsPedido = agrupar(r.pedido_items, "pedido_id");
    const histPedido = agrupar(r.pedido_historial, "pedido_id");
    const pedidos = r.pedidos.map((o) => ({
      id: o.id, numero: o.numero, fecha: o.fecha, creado: o.created_at, actualizado: o.updated_at, clienteId: o.cliente_id, clienteNombre: o.cliente_nombre,
      items: (itemsPedido.get(o.id) || []).map((i) => ({ productoId: i.producto_id, nombre: i.nombre, codigo: nz(i.codigo), cantidad: num(i.cantidad), precioUnitario: num(i.precio_unitario), subtotal: num(i.subtotal) })),
      total: num(o.total), estado: o.estado, observaciones: nz(o.observaciones), ventaId: o.venta_id || null, ventaNumero: o.venta_id ? nz(numeroVenta.get(o.venta_id)) : "",
      historial: (histPedido.get(o.id) || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((h) => ({ fecha: h.created_at, de: h.de || null, a: h.a, nota: nz(h.nota) }))
    }));

    const itemsCompra = agrupar(r.compra_items, "compra_id");
    const recepCompra = agrupar(r.compra_recepciones, "compra_id");
    const itemsRecep = agrupar(r.compra_recepcion_items, "recepcion_id");
    const compras = r.compras.map((c) => ({
      id: c.id, numero: c.numero, documento: nz(c.documento), proveedorId: c.proveedor_id, proveedorNombre: c.proveedor_nombre, fecha: c.fecha, creado: c.created_at,
      total: num(c.total), estado: c.estado, observaciones: nz(c.observaciones), motivoCancelacion: nz(c.motivo_cancelacion),
      items: (itemsCompra.get(c.id) || []).map((i) => ({ productoId: i.producto_id, nombre: i.nombre, codigo: nz(i.codigo), cantidad: num(i.cantidad), costoUnitario: num(i.costo_unitario), subtotal: num(i.subtotal), recibida: num(i.recibida) })),
      recepciones: (recepCompra.get(c.id) || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((x) => ({
        id: x.id, token: x.token || null, fecha: x.fecha, creado: x.created_at, nota: nz(x.nota), valor: num(x.valor),
        items: (itemsRecep.get(x.id) || []).map((i) => ({ productoId: i.producto_id, cantidad: num(i.cantidad), costoUnitario: num(i.costo_unitario) }))
      }))
    }));

    const clientes = r.clientes.map((c) => ({ id: c.id, nombre: c.nombre, documento: nz(c.documento), telefono: nz(c.telefono), correo: nz(c.correo), direccion: nz(c.direccion), observaciones: nz(c.observaciones), activo: c.activo !== false, creado: c.created_at }));
    const proveedores = r.proveedores.map((p) => ({ id: p.id, nombre: p.nombre, identificacion: nz(p.identificacion), contacto: nz(p.contacto), telefono: nz(p.telefono), correo: nz(p.correo), direccion: nz(p.direccion), observaciones: nz(p.observaciones), activo: p.activo !== false, creado: p.created_at }));
    const finanzas = r.movimientos_financieros.map((m) => ({
      id: m.id, fecha: m.fecha, tipo: m.tipo, concepto: m.concepto, valor: num(m.valor), categoria: m.categoria, metodoPago: nz(m.metodo_pago), observaciones: nz(m.observaciones),
      origen: "manual", estado: m.estado, motivoAnulacion: nz(m.motivo_anulacion), historial: Array.isArray(m.historial) ? m.historial : [], creado: m.created_at
    }));

    const c = r.configuracion || {};
    const config = {
      negocio: (r.negocio && r.negocio.nombre) || "", moneda: c.moneda || "COP", formatoFecha: c.formato_fecha || "dd/mm/aaaa", minimoDefecto: c.minimo_defecto == null ? 3 : num(c.minimo_defecto),
      permitirDescuentos: c.permitir_descuentos !== false, marketing: { whatsapp: nz(c.marketing_whatsapp), instagram: nz(c.marketing_instagram), ciudad: nz(c.marketing_ciudad) },
      consecutivos: { venta: num(c.consec_venta), pedido: num(c.consec_pedido), compra: num(c.consec_compra) }, ultimoRespaldo: c.ultimo_respaldo || null, ultimaMigracion: null
    };
    return { productos, movimientos, ventas, pedidos, finanzas, clientes, proveedores, compras, config, fotos };
  }

  /* ---------- Cliente de Supabase ---------- */
  const TABLAS = [
    // [tabla, columna para ordenar de la más nueva a la más antigua, columna única para desempatar]
    // OJO: producto_proveedores y producto_marketing NO tienen columna "id" (su llave es producto_id).
    ["productos", "created_at", "id"], ["clientes", "created_at", "id"], ["proveedores", "created_at", "id"],
    ["producto_proveedores", null, "producto_id"], ["producto_marketing", null, "producto_id"],
    ["producto_fotos", null, "id"], ["movimientos_inventario", "created_at", "id"], ["ventas", "created_at", "id"], ["venta_items", null, "id"], ["venta_pagos", null, "id"],
    ["pedidos", "created_at", "id"], ["pedido_items", null, "id"], ["pedido_historial", null, "id"], ["compras", "created_at", "id"], ["compra_items", null, "id"],
    ["compra_recepciones", null, "id"], ["compra_recepcion_items", null, "id"], ["movimientos_financieros", "created_at", "id"]
  ];
  const vacio = () => ({ productos: [], movimientos: [], ventas: [], pedidos: [], finanzas: [], clientes: [], proveedores: [], compras: [], config: { negocio: "", moneda: "COP", formatoFecha: "dd/mm/aaaa", minimoDefecto: 3, permitirDescuentos: true, marketing: { whatsapp: "", instagram: "", ciudad: "" }, consecutivos: { venta: 0, pedido: 0, compra: 0 }, ultimoRespaldo: null, ultimaMigracion: null }, fotos: {} });

  const Nube = {
    sb: null, negocioId: null, usuario: null, cache: vacio(), ultimaCarga: 0, BUCKET: "fotos-productos",
    traducirError, traducirAuth, mapear, vacio,
    iniciar() {
      const cfg = global.MINY_SUPABASE;
      if (!cfg || !cfg.url || !cfg.key) throw new ErrorNegocio("Falta configurar js/config-supabase.js (URL y clave pública de Supabase).");
      if (!global.supabase || typeof global.supabase.createClient !== "function") throw new ErrorNegocio("No se pudo cargar la librería de Supabase. Revisa tu conexión a internet y recarga la página.");
      Nube.sb = global.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      return Nube.sb;
    },
    async exec(promesa) {
      let r;
      try { r = await promesa; } catch (e) { throw traducirError(e); }
      if (r && r.error) throw traducirError(r.error);
      return r ? r.data : null;
    },
    rpc(nombre, args) { return Nube.exec(Nube.sb.rpc(nombre, args)); },
    async traerTodo(tabla, orden, desempate) {
      const filas = []; const TAM = 1000;
      for (let desde = 0; desde < 20000; desde += TAM) {
        let q = Nube.sb.from(tabla).select("*");
        if (orden) q = q.order(orden, { ascending: false });
        q = q.order(desempate || "id", { ascending: true });
        const lote = await Nube.exec(q.range(desde, desde + TAM - 1));
        filas.push(...lote);
        if (lote.length < TAM) break;
      }
      return filas;
    },
    /* --- sesión --- */
    async sesion() {
      const { data, error } = await Nube.sb.auth.getSession();
      if (error) throw new ErrorNegocio(traducirAuth(error));
      Nube.usuario = data.session ? data.session.user : null;
      return data.session;
    },
    async registrar({ email, password, negocio }) {
      const redirect = global.location.origin + global.location.pathname;
      const { data, error } = await Nube.sb.auth.signUp({ email, password, options: { data: { negocio }, emailRedirectTo: redirect } });
      if (error) throw new ErrorNegocio(traducirAuth(error));
      const yaExistia = data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
      return { sesion: data.session, yaExistia };
    },
    async entrar(email, password) {
      const { data, error } = await Nube.sb.auth.signInWithPassword({ email, password });
      if (error) throw new ErrorNegocio(traducirAuth(error));
      Nube.usuario = data.user;
      return data.session;
    },
    async salir() { await Nube.sb.auth.signOut(); Nube.usuario = null; Nube.negocioId = null; Nube.cache = vacio(); },
    async enviarRecuperacion(email) {
      const { error } = await Nube.sb.auth.resetPasswordForEmail(email, { redirectTo: global.location.origin + global.location.pathname });
      if (error) throw new ErrorNegocio(traducirAuth(error));
    },
    async cambiarClave(nueva) {
      const { error } = await Nube.sb.auth.updateUser({ password: nueva });
      if (error) throw new ErrorNegocio(traducirAuth(error));
    },
    /* --- datos --- */
    async cargarNegocio() {
      const filas = await Nube.exec(Nube.sb.from("negocios").select("id, nombre").limit(1));
      if (!filas || !filas.length) throw new ErrorNegocio("Tu cuenta todavía no tiene un negocio asociado. Cierra sesión y vuelve a entrar; si persiste, revisa que el script de la base de datos se ejecutó completo.");
      Nube.negocioId = filas[0].id;
      return filas[0];
    },
    /** Descarga TODOS los datos del negocio y reconstruye la copia en memoria. */
    async refrescar() {
      if (!Nube.negocioId) await Nube.cargarNegocio();
      const res = {};
      const trabajos = TABLAS.map(async ([tabla, orden, desempate]) => { res[tabla] = await Nube.traerTodo(tabla, orden, desempate); });
      trabajos.push((async () => { res.negocio = (await Nube.exec(Nube.sb.from("negocios").select("id, nombre").eq("id", Nube.negocioId).limit(1)))[0]; })());
      trabajos.push((async () => { res.configuracion = (await Nube.exec(Nube.sb.from("configuracion").select("*").eq("negocio_id", Nube.negocioId).limit(1)))[0]; })());
      await Promise.all(trabajos);
      Nube.cache = mapear(res);
      Nube.ultimaCarga = Date.now();
      U.moneda = Nube.cache.config.moneda; U.formatoFecha = Nube.cache.config.formatoFecha;
      return Nube.cache;
    },
    necesitaRefresco(segundos) { return Date.now() - Nube.ultimaCarga > (segundos || 20) * 1000; }
  };

  // Las pantallas leen la copia en memoria; ya no se usa el almacenamiento local para los datos.
  Store.leer = () => Nube.cache;
  Store.transaccion = () => { throw new ErrorNegocio("Operación no disponible en la versión conectada (use las funciones de la nube)."); };

  global.MINY.Nube = Nube;
})(typeof window !== "undefined" ? window : globalThis);
