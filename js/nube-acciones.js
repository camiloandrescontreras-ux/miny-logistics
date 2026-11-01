"use strict";
/*
 * MINY Logistics · ACCIONES EN LA NUBE (fase 4)
 * Reemplaza las funciones que modificaban datos locales por llamadas a Supabase.
 * Los nombres y los parámetros son los mismos que usan las pantallas; la diferencia es que ahora son asíncronas.
 * Las reglas de negocio (stock, duplicados, estados, saldos) las aplica la base de datos con las funciones del script SQL.
 */
(function (global) {
  const { U, Store, ErrorNegocio } = global.MINY;
  const Nube = global.MINY.Nube;
  const D = global.MINY.Dominio;
  const Mk = global.MINY.Marketing;
  const Fo = global.MINY.Fotos;
  const sb = () => Nube.sb;
  const neg = () => Nube.negocioId;
  const exec = (p) => Nube.exec(p);
  const rpc = (nombre, args) => Nube.rpc(nombre, args);
  const texto = (v, max) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
  const entero = (v, mensaje, min) => {
    const n = Number(v);
    if (v === "" || v === null || v === undefined || !Number.isInteger(n) || n < (min ?? 0)) throw new ErrorNegocio(mensaje);
    return n;
  };
  const fechaOk = (f, etiqueta) => { if (!U.esFechaISO(f)) throw new ErrorNegocio(`La fecha ${etiqueta} no es válida.`); return f; };
  const buscar = (lista, id) => lista.find((x) => x.id === id);
  async function actualizar(tabla, id, campos, clave) {
    const filas = await exec(sb().from(tabla).update(campos).eq(clave || "id", id).select(clave || "id"));
    if (!filas || !filas.length) throw new ErrorNegocio("No se pudo actualizar: el registro no existe o no tienes permiso.");
  }
  const items = (lista, extra) => lista.map((it) => ({ producto_id: it.productoId, cantidad: Number(it.cantidad), ...(extra ? extra(it) : {}) }));
  async function recargar() { await Nube.refrescar(); }

  /* ================= PRODUCTOS ================= */
  async function sincronizarProveedores(productoId, nuevos) {
    const p = buscar(Store.leer().productos, productoId);
    const actual = new Set((p && p.proveedorIds) || []);
    const quitar = [...actual].filter((x) => !nuevos.includes(x));
    const poner = nuevos.filter((x) => !actual.has(x));
    if (quitar.length) await exec(sb().from("producto_proveedores").delete().eq("producto_id", productoId).in("proveedor_id", quitar));
    if (poner.length) await exec(sb().from("producto_proveedores").insert(poner.map((pid) => ({ negocio_id: neg(), producto_id: productoId, proveedor_id: pid }))));
  }
  D.guardarProducto = async function (i) {
    const d = Store.leer();
    const nombre = texto(i.nombre, 120);
    if (!nombre) throw new ErrorNegocio("El nombre del producto es obligatorio.");
    const costo = entero(i.costo, "El costo unitario debe ser un número entero mayor o igual a cero.");
    const precio = entero(i.precio, "El precio de venta debe ser un número entero mayor o igual a cero.");
    const minimoTxt = i.minimo === "" || i.minimo == null ? null : entero(i.minimo, "El nivel mínimo de existencias debe ser un entero mayor o igual a cero.");
    const inicial = i.id || i.cantidad === "" || i.cantidad == null ? 0 : entero(i.cantidad, "Las existencias iniciales deben ser un entero mayor o igual a cero.");
    const existente = i.id ? buscar(d.productos, i.id) : null;
    if (i.id && !existente) throw new ErrorNegocio("No se encontró el producto que intentas editar.");
    const sku = texto(i.codigo, 60);
    const barras = texto(i.barras, 60);
    const otros = d.productos.filter((p) => p.id !== i.id);
    if (sku && otros.some((p) => U.normalizar(p.codigo) === U.normalizar(sku))) throw new ErrorNegocio("Ese SKU ya está asignado a otro producto.", "DUPLICADO");
    if (barras && otros.some((p) => p.barras && U.normalizar(p.barras) === U.normalizar(barras))) throw new ErrorNegocio("Ese código de barras ya está asignado a otro producto.", "DUPLICADO");
    const fila = { nombre, barras, categoria: texto(i.categoria, 80), descripcion: texto(i.descripcion, 500), unidad: D.UNIDADES.includes(i.unidad) ? i.unidad : "unidad", costo, precio };
    let id = i.id;
    if (existente) {
      await actualizar("productos", id, { ...fila, sku: sku || existente.codigo, minimo: minimoTxt ?? d.config.minimoDefecto });
    } else {
      const nuevo = await exec(sb().from("productos").insert({ negocio_id: neg(), ...fila, sku, minimo: minimoTxt }).select("id").single());
      id = nuevo.id;
    }
    await sincronizarProveedores(id, Array.isArray(i.proveedorIds) ? i.proveedorIds : []);
    if (!existente && inicial > 0) {
      try { await rpc("registrar_movimiento", { p_producto: id, p_tipo: "inventario_inicial", p_cantidad: inicial, p_nota: "Existencias iniciales del producto" }); }
      catch (e) { await recargar(); throw new ErrorNegocio("El producto se creó, pero no se pudieron registrar sus existencias iniciales: " + e.message + " Regístralas desde Inventario."); }
    }
    await recargar();
    return buscar(Store.leer().productos, id);
  };
  D.cambiarActivoProducto = async function (id, activo) { await actualizar("productos", id, { activo: !!activo }); await recargar(); return buscar(Store.leer().productos, id); };
  D.eliminarProducto = async function (id) {
    const d = Store.leer(); const p = buscar(d.productos, id);
    if (!p) throw new ErrorNegocio("Producto no encontrado.");
    if (D.productoTieneHistorial(d, id)) throw new ErrorNegocio("Este producto tiene historial (movimientos, ventas, pedidos o compras). No se puede eliminar; puedes desactivarlo para conservar el historial.", "HISTORIAL");
    const rutas = p.marketing.fotoIds.map((f) => d.fotos[f]).filter(Boolean);
    await exec(sb().from("productos").delete().eq("id", id));
    if (rutas.length) { try { await sb().storage.from(Nube.BUCKET).remove(rutas); } catch (e) { /* las fotos huérfanas no afectan los datos */ } }
    await recargar();
  };

  /* ================= INVENTARIO ================= */
  D.registrarMovimiento = async function (i) {
    const cantidad = entero(i.cantidad, "La cantidad debe ser un número entero mayor que cero.", 1);
    const id = await rpc("registrar_movimiento", { p_producto: i.productoId || null, p_tipo: i.tipo, p_cantidad: cantidad, p_fecha: i.fecha || null, p_documento: texto(i.documento, 60), p_nota: texto(i.nota, 300) });
    await recargar();
    return buscar(Store.leer().movimientos, id);
  };
  D.revertirMovimiento = async function (id, motivo) { await rpc("revertir_movimiento", { p_movimiento: id, p_motivo: motivo }); await recargar(); };

  /* ================= VENTAS Y COBROS ================= */
  D.crearVenta = async function (i) {
    const descuento = i.descuento === "" || i.descuento == null ? 0 : entero(i.descuento, "El descuento debe ser un entero mayor o igual a cero.");
    const abono = i.abono === "" || i.abono == null ? 0 : entero(i.abono, "El abono inicial debe ser un entero mayor o igual a cero.");
    if (!Array.isArray(i.items) || !i.items.length) throw new ErrorNegocio("Agrega al menos un producto.");
    const id = await rpc("crear_venta", {
      p_negocio: neg(), p_items: items(i.items), p_cliente: i.clienteId || null, p_fecha: i.fecha || null, p_descuento: descuento,
      p_metodo_pago: i.metodoPago || null, p_condicion: i.condicion === "credito" ? "credito" : "contado", p_abono: abono, p_vencimiento: i.vencimiento || null,
      p_observaciones: texto(i.observaciones, 300), p_token: i.token || null
    });
    await recargar();
    return buscar(Store.leer().ventas, id);
  };
  D.anularVenta = async function (id, motivo) { await rpc("anular_venta", { p_venta: id, p_motivo: motivo }); await recargar(); return buscar(Store.leer().ventas, id); };
  D.registrarPago = async function (ventaId, i) {
    await rpc("registrar_pago", { p_venta: ventaId, p_valor: entero(i.valor, "El valor del abono debe ser un entero mayor que cero.", 1), p_fecha: i.fecha || null, p_metodo_pago: i.metodoPago || null, p_nota: texto(i.nota, 300), p_token: i.token || null });
    await recargar();
    return buscar(Store.leer().ventas, ventaId);
  };
  D.anularPago = async function (ventaId, pagoId, motivo) { await rpc("anular_pago", { p_pago: pagoId, p_motivo: motivo }); await recargar(); return buscar(Store.leer().ventas, ventaId); };
  D.cambiarVencimiento = async function (ventaId, fecha) { await rpc("cambiar_vencimiento", { p_venta: ventaId, p_fecha: fecha || null }); await recargar(); return buscar(Store.leer().ventas, ventaId); };

  /* ================= PEDIDOS ================= */
  D.guardarPedido = async function (i) {
    if (!Array.isArray(i.items) || !i.items.length) throw new ErrorNegocio("Agrega al menos un producto.");
    if (!i.clienteId) throw new ErrorNegocio("Selecciona un cliente para el pedido.");
    let id = i.id;
    if (id) {
      await rpc("editar_pedido", { p_pedido: id, p_cliente: i.clienteId, p_items: items(i.items), p_fecha: i.fecha || null, p_observaciones: texto(i.observaciones, 300) });
    } else {
      id = await rpc("crear_pedido", { p_negocio: neg(), p_cliente: i.clienteId, p_items: items(i.items), p_fecha: i.fecha || null, p_observaciones: texto(i.observaciones, 300) });
    }
    await recargar();
    return buscar(Store.leer().pedidos, id);
  };
  D.cambiarEstadoPedido = async function (id, nuevo, nota) { await rpc("cambiar_estado_pedido", { p_pedido: id, p_nuevo: nuevo, p_nota: texto(nota, 300) }); await recargar(); return buscar(Store.leer().pedidos, id); };
  D.entregarPedido = async function (id, o) {
    o = o || {};
    const abono = o.abono === "" || o.abono == null ? 0 : entero(o.abono, "El abono inicial debe ser un entero mayor o igual a cero.");
    const ventaId = await rpc("entregar_pedido", { p_pedido: id, p_metodo_pago: o.metodoPago || null, p_condicion: o.condicion === "credito" ? "credito" : "contado", p_abono: abono, p_vencimiento: o.vencimiento || null });
    await recargar();
    const d = Store.leer();
    return { pedido: buscar(d.pedidos, id), venta: buscar(d.ventas, ventaId) };
  };

  /* ================= CLIENTES Y PROVEEDORES ================= */
  async function guardarTercero(tabla, lista, i, extra) {
    const nombre = texto(i.nombre, 140);
    if (!nombre) throw new ErrorNegocio(`El nombre o razón social del ${tabla === "clientes" ? "cliente" : "proveedor"} es obligatorio.`);
    const fila = { nombre, telefono: texto(i.telefono, 20), correo: texto(i.correo, 120), direccion: texto(i.direccion, 200), observaciones: texto(i.observaciones, 500) };
    extra.forEach((k) => { fila[k] = texto(i[k], k === "contacto" ? 140 : 40); });
    if (fila.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fila.correo)) throw new ErrorNegocio("El correo electrónico no tiene un formato válido.");
    if (fila.telefono && !/^[0-9+() -]{7,20}$/.test(fila.telefono)) throw new ErrorNegocio("El teléfono solo puede tener números, espacios, + ( ) - y entre 7 y 20 caracteres.");
    const otros = lista.filter((x) => x.id !== i.id);
    if (!i.forzar && otros.some((x) => U.normalizar(x.nombre) === U.normalizar(nombre))) {
      throw new ErrorNegocio(`Ya existe un ${tabla === "clientes" ? "cliente" : "proveedor"} con el mismo nombre. Si es otra persona o empresa, confirma para guardarlo igualmente.`, "POSIBLE_DUPLICADO");
    }
    let id = i.id;
    if (id) await actualizar(tabla, id, fila);
    else id = (await exec(sb().from(tabla).insert({ negocio_id: neg(), ...fila }).select("id").single())).id;
    await recargar();
    return buscar(Store.leer()[tabla], id);
  }
  D.guardarCliente = (i) => guardarTercero("clientes", Store.leer().clientes, i, ["documento"]);
  D.guardarProveedor = (i) => guardarTercero("proveedores", Store.leer().proveedores, i, ["identificacion", "contacto"]);
  D.cambiarActivoTercero = async function (lista, id, activo) {
    if (lista !== "clientes" && lista !== "proveedores") throw new ErrorNegocio("Registro no válido.");
    await actualizar(lista, id, { activo: !!activo }); await recargar(); return buscar(Store.leer()[lista], id);
  };

  /* ================= COMPRAS ================= */
  D.guardarCompra = async function (i) {
    if (!Array.isArray(i.items) || !i.items.length) throw new ErrorNegocio("Agrega al menos un producto.");
    if (!i.proveedorId) throw new ErrorNegocio("Selecciona un proveedor.");
    const lineas = items(i.items, (it) => ({ costo_unitario: Number(it.costoUnitario) }));
    const comunes = { p_proveedor: i.proveedorId, p_items: lineas, p_fecha: i.fecha || null, p_documento: texto(i.documento, 60), p_estado: i.estado === "borrador" ? "borrador" : "pendiente", p_observaciones: texto(i.observaciones, 300) };
    let id = i.id;
    if (id) await rpc("editar_compra", { p_compra: id, ...comunes });
    else id = await rpc("crear_compra", { p_negocio: neg(), ...comunes });
    await recargar();
    return buscar(Store.leer().compras, id);
  };
  D.cambiarEstadoCompra = async function (id, nuevo, motivo) { await rpc("cambiar_estado_compra", { p_compra: id, p_nuevo: nuevo, p_motivo: texto(motivo, 300) }); await recargar(); return buscar(Store.leer().compras, id); };
  D.recibirCompra = async function (id, i) {
    const lineas = (i.lineas || []).map((l) => ({ producto_id: l.productoId, cantidad: Number(l.cantidad) }));
    await rpc("recibir_compra", { p_compra: id, p_lineas: lineas, p_fecha: i.fecha || null, p_nota: texto(i.nota, 300), p_token: i.token || null, p_actualizar_costos: !!i.actualizarCostos });
    await recargar();
    return buscar(Store.leer().compras, id);
  };

  /* ================= FINANZAS ================= */
  D.guardarMovimientoFinanciero = async function (i) {
    const tipo = i.tipo === "ingreso" ? "ingreso" : i.tipo === "egreso" ? "egreso" : null;
    if (!tipo) throw new ErrorNegocio("Elige si es ingreso o gasto.");
    const concepto = texto(i.concepto, 140);
    if (!concepto) throw new ErrorNegocio("El concepto es obligatorio.");
    const valor = entero(i.valor, "El importe debe ser un entero mayor que cero.", 1);
    const fecha = fechaOk(i.fecha, "del movimiento");
    const permitidas = tipo === "ingreso" ? D.CATEGORIAS_INGRESO : D.CATEGORIAS_EGRESO;
    const fila = { tipo, concepto, valor, fecha, categoria: permitidas.includes(i.categoria) ? i.categoria : (tipo === "ingreso" ? "Otros ingresos" : "Otros gastos"), metodo_pago: D.METODOS_PAGO.includes(i.metodoPago) ? i.metodoPago : null, observaciones: texto(i.observaciones, 300) };
    let id = i.id;
    if (id) await actualizar("movimientos_financieros", id, fila);
    else id = (await exec(sb().from("movimientos_financieros").insert({ negocio_id: neg(), ...fila }).select("id").single())).id;
    await recargar();
    return buscar(Store.leer().finanzas, id);
  };
  D.anularMovimientoFinanciero = async function (id, motivo) { await rpc("anular_movimiento_financiero", { p_id: id, p_motivo: motivo }); await recargar(); };

  /* ================= CONFIGURACIÓN ================= */
  D.guardarConfig = async function (i) {
    const { MONEDAS, FORMATOS_FECHA } = global.MINY;
    if (!MONEDAS.includes(i.moneda)) throw new ErrorNegocio("Moneda no válida.");
    if (!FORMATOS_FECHA.includes(i.formatoFecha)) throw new ErrorNegocio("Formato de fecha no válido.");
    const minimo = entero(i.minimoDefecto, "El mínimo de existencias por defecto debe ser un entero mayor o igual a cero.");
    await actualizar("negocios", neg(), { nombre: texto(i.negocio, 80) || "Mi negocio" });
    await actualizar("configuracion", neg(), { moneda: i.moneda, formato_fecha: i.formatoFecha, minimo_defecto: minimo, permitir_descuentos: !!i.permitirDescuentos }, "negocio_id");
    await recargar();
    return Store.leer().config;
  };
  D.restablecerConfig = async function () {
    await actualizar("configuracion", neg(), { moneda: "COP", formato_fecha: "dd/mm/aaaa", minimo_defecto: 3, permitir_descuentos: true, marketing_whatsapp: null, marketing_instagram: null, marketing_ciudad: null }, "negocio_id");
    await recargar();
  };

  /* ================= MARKETING ================= */
  Mk.guardar = async function (productoId, cambios) {
    const d = Store.leer(); const p = buscar(d.productos, productoId);
    if (!p) throw new ErrorNegocio("Producto no encontrado.");
    const m = { ...Mk.completar(p.marketing) };
    const cad = (v, max) => String(v ?? "").slice(0, max);
    if ("caracteristicas" in cambios) m.caracteristicas = cad(cambios.caracteristicas, 1200);
    if ("publico" in cambios) m.publico = cad(cambios.publico, 120);
    if ("oferta" in cambios) m.oferta = cad(cambios.oferta, 120);
    if ("cta" in cambios && Mk.CTAS[cambios.cta]) m.cta = cambios.cta;
    if ("tono" in cambios && Mk.TONOS[cambios.tono]) m.tono = cambios.tono;
    if ("variante" in cambios && Number.isInteger(cambios.variante)) m.variante = Math.max(0, cambios.variante);
    if ("textos" in cambios) {
      const t = cambios.textos;
      m.textos = t ? { corta: cad(t.corta, 400), larga: cad(t.larga, 4000), publicacion: cad(t.publicacion, 3000), whatsapp: cad(t.whatsapp, 3000), hashtags: cad(t.hashtags, 600) } : null;
    }
    const fila = { caracteristicas: m.caracteristicas || null, publico: m.publico || null, oferta: m.oferta || null, cta: m.cta, tono: m.tono, variante: m.variante, textos: m.textos };
    let actualizado = false;
    if (p.marketing.existe) {
      const r = await exec(sb().from("producto_marketing").update(fila).eq("producto_id", productoId).select("producto_id"));
      actualizado = !!(r && r.length);
    }
    if (!actualizado) await exec(sb().from("producto_marketing").insert({ producto_id: productoId, negocio_id: neg(), ...fila }));
    p.marketing = { ...p.marketing, ...m, existe: true };   // se actualiza la copia local sin recargar todo
    return p.marketing;
  };
  Mk.guardarContacto = async function (c) {
    const wa = String(c.whatsapp || "").trim();
    if (wa && !/^\+?[0-9 ()-]{7,20}$/.test(wa)) throw new ErrorNegocio("El WhatsApp solo puede tener números, espacios, + ( ) - (entre 7 y 20 caracteres).");
    const ig = String(c.instagram || "").trim().replace(/^@+/, "").slice(0, 40);
    const ciudad = String(c.ciudad || "").trim().slice(0, 60);
    await actualizar("configuracion", neg(), { marketing_whatsapp: wa || null, marketing_instagram: ig || null, marketing_ciudad: ciudad || null }, "negocio_id");
    Store.leer().config.marketing = { whatsapp: wa, instagram: ig, ciudad };
    return Store.leer().config.marketing;
  };

  /* ---- Fotos: ahora viven en Supabase Storage (bucket privado) ---- */
  Fo.agregar = async function (productoId, archivo) {
    const d = Store.leer(); const p = buscar(d.productos, productoId);
    if (!p) throw new ErrorNegocio("Selecciona un producto.");
    if (p.marketing.fotoIds.length >= Fo.MAX_FOTOS) throw new ErrorNegocio(`Cada producto admite hasta ${Fo.MAX_FOTOS} fotos.`);
    const blob = await Fo.reducir(archivo);
    const ruta = `${neg()}/${productoId}/${U.id()}.jpg`;
    const { error } = await sb().storage.from(Nube.BUCKET).upload(ruta, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw Nube.traducirError(error);
    let fila;
    try { fila = await exec(sb().from("producto_fotos").insert({ negocio_id: neg(), producto_id: productoId, ruta, orden: p.marketing.fotoIds.length }).select("id").single()); }
    catch (e) { await sb().storage.from(Nube.BUCKET).remove([ruta]); throw e; }
    p.marketing.fotoIds.push(fila.id); d.fotos[fila.id] = ruta;
    return fila.id;
  };
  Fo.obtener = async function (id) {
    const ruta = Store.leer().fotos[id];
    if (!ruta) return undefined;
    const { data, error } = await sb().storage.from(Nube.BUCKET).download(ruta);
    if (error || !data) return undefined;
    return { id, blob: data };
  };
  Fo.quitar = async function (productoId, id) {
    const d = Store.leer(); const ruta = d.fotos[id];
    await exec(sb().from("producto_fotos").delete().eq("id", id));
    if (ruta) { try { await sb().storage.from(Nube.BUCKET).remove([ruta]); } catch (e) { /* archivo huérfano: no afecta */ } }
    const p = buscar(d.productos, productoId);
    if (p) p.marketing.fotoIds = p.marketing.fotoIds.filter((f) => f !== id);
    delete d.fotos[id];
  };
  Fo.principal = async function (productoId, id) {
    const d = Store.leer(); const p = buscar(d.productos, productoId);
    if (!p) throw new ErrorNegocio("Producto no encontrado.");
    const orden = [id, ...p.marketing.fotoIds.filter((f) => f !== id)];
    for (let k = 0; k < orden.length; k++) await actualizar("producto_fotos", orden[k], { orden: k });
    p.marketing.fotoIds = orden;
  };
  Fo.eliminarDeProducto = async function () { /* se limpia dentro de eliminarProducto */ };

  /* ================= RESPALDO ================= */
  Nube.exportarRespaldo = async function () {
    const datos = await rpc("exportar_respaldo", { p_negocio: neg() });
    await recargar();
    return datos;
  };
})(typeof window !== "undefined" ? window : globalThis);
