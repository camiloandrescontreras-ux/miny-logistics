"use strict";
/*
 * MINY Logistics · REGLAS DE NEGOCIO
 * Todas las operaciones que cambian datos pasan por Store.transaccion(): o se guardan completas
 * o no se guarda nada. Las relaciones entre registros usan siempre el "id" interno (no el nombre ni el SKU).
 */
(function (global) {
  const { U, Store, ErrorNegocio } = global.MINY;

  /* ---------- Catálogos ---------- */
  const UNIDADES = ["unidad", "par", "docena", "caja", "paquete", "kg", "g", "litro", "ml", "metro", "servicio"];
  const METODOS_PAGO = ["Efectivo", "Transferencia", "Tarjeta", "Otro"];
  const CATEGORIAS_INGRESO = ["Otros ingresos", "Aportes del dueño", "Devoluciones recibidas"];
  const CATEGORIAS_EGRESO = ["Arriendo", "Servicios públicos", "Nómina", "Transporte y envíos", "Publicidad", "Impuestos", "Mantenimiento", "Otros gastos"];
  const TIPOS_MOV = {
    entrada: { signo: 1, etiqueta: "Entrada", manual: true },
    salida: { signo: -1, etiqueta: "Salida", manual: true },
    ajuste_positivo: { signo: 1, etiqueta: "Ajuste positivo", manual: true },
    ajuste_negativo: { signo: -1, etiqueta: "Ajuste negativo", manual: true },
    inventario_inicial: { signo: 1, etiqueta: "Inventario inicial" },
    venta: { signo: -1, etiqueta: "Venta" },
    compra: { signo: 1, etiqueta: "Recepción de compra" },
    anulacion_venta: { signo: 1, etiqueta: "Anulación de venta" },
    reversion: { signo: 0, etiqueta: "Reversión" }
  };
  const ESTADOS_PEDIDO = { pendiente: "Pendiente", confirmado: "Confirmado", en_preparacion: "En preparación", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado" };
  const TRANSICIONES_PEDIDO = { pendiente: ["confirmado", "cancelado"], confirmado: ["en_preparacion", "cancelado"], en_preparacion: ["listo", "cancelado"], listo: ["entregado", "cancelado"], entregado: [], cancelado: [] };
  const ESTADOS_QUE_COMPROMETEN = ["confirmado", "en_preparacion", "listo"];
  const ESTADOS_COMPRA = { borrador: "Borrador", pendiente: "Pendiente de recepción", parcial: "Recepción parcial", recibida: "Recibida", cancelada: "Cancelada" };

  /* ---------- Validaciones compartidas ---------- */
  const esEnteroNoNeg = (v) => { const n = Number(v); return v !== "" && v !== null && v !== undefined && Number.isInteger(n) && n >= 0; };
  const cadena = (v, max) => String(v ?? "").trim().slice(0, max);
  function exigirFecha(f, etiqueta) {
    if (!U.esFechaISO(f)) throw new ErrorNegocio(`La fecha ${etiqueta || ""} no es válida.`.replace("  ", " "));
    return f;
  }
  function validarContacto(i) {
    if (i.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(i.correo)) throw new ErrorNegocio("El correo electrónico no tiene un formato válido.");
    if (i.telefono && !/^[0-9+()\-\s]{7,20}$/.test(i.telefono)) throw new ErrorNegocio("El teléfono solo puede tener números, espacios, + ( ) - y entre 7 y 20 caracteres.");
  }
  function siguienteNumero(d, clave, prefijo) {
    d.config.consecutivos[clave] = (d.config.consecutivos[clave] || 0) + 1;
    return prefijo + "-" + String(d.config.consecutivos[clave]).padStart(6, "0");
  }
  const productoDe = (d, id) => d.productos.find((p) => p.id === id);
  const clienteDe = (d, id) => d.clientes.find((c) => c.id === id);
  const proveedorDe = (d, id) => d.proveedores.find((p) => p.id === id);

  /* ---------- Productos ---------- */
  function coincideProducto(p, consulta) {
    const q = U.normalizar(consulta);
    return !q || [p.nombre, p.codigo, p.barras, p.categoria].some((x) => U.normalizar(x).includes(q));
  }
  function buscarProductos(d, consulta, { soloActivos = false } = {}) {
    return d.productos.filter((p) => (!soloActivos || p.activo !== false) && coincideProducto(p, consulta));
  }
  /** Unidades que ya tienen pedidos confirmados, en preparación o listos (aún no descontadas del inventario). */
  function comprometido(d, productoId, excluirPedidoId) {
    let t = 0;
    d.pedidos.forEach((o) => {
      if (o.id === excluirPedidoId || !ESTADOS_QUE_COMPROMETEN.includes(o.estado)) return;
      o.items.forEach((it) => { if (it.productoId === productoId) t += it.cantidad; });
    });
    return t;
  }
  function nivelStock(p) {
    if (p.cantidad <= 0) return "agotado";
    if (p.cantidad <= (p.minimo ?? 0)) return "bajo";
    return "normal";
  }
  function margen(p) {
    if (!(p.costo > 0) || !(p.precio > 0)) return null;
    return { valor: p.precio - p.costo, porcentaje: ((p.precio - p.costo) / p.precio) * 100 };
  }
  function generarSKU(d) {
    const usados = new Set(d.productos.map((p) => U.normalizar(p.codigo)));
    let n = d.productos.reduce((mx, p) => { const m = /^MIN-(\d+)$/i.exec(p.codigo || ""); return m ? Math.max(mx, +m[1]) : mx; }, 0);
    let s;
    do { n++; s = "MIN-" + String(n).padStart(4, "0"); } while (usados.has(U.normalizar(s)));
    return s;
  }
  function guardarProducto(i) {
    return Store.transaccion((d) => {
      const id = i.id || null;
      const actual = id ? productoDe(d, id) : null;
      if (id && !actual) throw new ErrorNegocio("No se encontró el producto que intentas editar.");
      const nombre = cadena(i.nombre, 120);
      if (!nombre) throw new ErrorNegocio("El nombre del producto es obligatorio.");
      let codigo = cadena(i.codigo, 60);
      const barras = cadena(i.barras, 60);
      if (!esEnteroNoNeg(i.costo)) throw new ErrorNegocio("El costo unitario debe ser un número entero mayor o igual a cero.");
      if (!esEnteroNoNeg(i.precio)) throw new ErrorNegocio("El precio de venta debe ser un número entero mayor o igual a cero.");
      const minimo = i.minimo === "" || i.minimo == null ? d.config.minimoDefecto : i.minimo;
      if (!esEnteroNoNeg(minimo)) throw new ErrorNegocio("El nivel mínimo de existencias debe ser un entero mayor o igual a cero.");
      const unidad = UNIDADES.includes(i.unidad) ? i.unidad : "unidad";
      const otros = d.productos.filter((p) => p.id !== id);
      if (codigo && otros.some((p) => U.normalizar(p.codigo) === U.normalizar(codigo))) throw new ErrorNegocio("Ese SKU ya está asignado a otro producto.", "DUPLICADO");
      if (!codigo) codigo = generarSKU(d);
      if (barras && otros.some((p) => U.normalizar(p.barras) === U.normalizar(barras))) throw new ErrorNegocio("Ese código de barras ya está asignado a otro producto.", "DUPLICADO");
      const proveedorIds = (Array.isArray(i.proveedorIds) ? i.proveedorIds : []).filter((x) => proveedorDe(d, x));
      const base = { nombre, codigo, barras, categoria: cadena(i.categoria, 80), descripcion: cadena(i.descripcion, 500), unidad, costo: Number(i.costo), precio: Number(i.precio), minimo: Number(minimo), proveedorIds };
      if (actual) {
        Object.assign(actual, base, { actualizado: U.ahora() });
        if (typeof i.activo === "boolean") actual.activo = i.activo;
        return actual;
      }
      const inicial = i.cantidad === "" || i.cantidad == null ? 0 : i.cantidad;
      if (!esEnteroNoNeg(inicial)) throw new ErrorNegocio("Las existencias iniciales deben ser un entero mayor o igual a cero.");
      const nuevo = { id: U.id(), ...base, cantidad: 0, activo: true, creado: U.ahora(), actualizado: null };
      d.productos.unshift(nuevo);
      if (Number(inicial) > 0) aplicarMovimiento(d, { productoId: nuevo.id, tipo: "inventario_inicial", cantidad: Number(inicial), nota: "Existencias iniciales del producto" });
      return nuevo;
    });
  }
  function cambiarActivoProducto(id, activo) {
    return Store.transaccion((d) => {
      const p = productoDe(d, id); if (!p) throw new ErrorNegocio("Producto no encontrado.");
      p.activo = !!activo; p.actualizado = U.ahora(); return p;
    });
  }
  function productoTieneHistorial(d, id) {
    return d.movimientos.some((m) => m.productoId === id) || d.ventas.some((v) => v.items.some((it) => it.productoId === id)) ||
      d.pedidos.some((o) => o.items.some((it) => it.productoId === id)) || d.compras.some((c) => c.items.some((it) => it.productoId === id));
  }
  function eliminarProducto(id) {
    return Store.transaccion((d) => {
      const p = productoDe(d, id); if (!p) throw new ErrorNegocio("Producto no encontrado.");
      if (productoTieneHistorial(d, id)) throw new ErrorNegocio("Este producto tiene historial (movimientos, ventas, pedidos o compras). No se puede eliminar; puedes desactivarlo para conservar el historial.", "HISTORIAL");
      d.productos = d.productos.filter((x) => x.id !== id);
    });
  }

  /* ---------- Inventario ---------- */
  /** ÚNICO punto donde cambian las existencias. Registra siempre un movimiento con "antes" y "después". */
  function aplicarMovimiento(d, m) {
    const p = productoDe(d, m.productoId);
    if (!p) throw new ErrorNegocio("Producto no encontrado para el movimiento.");
    const cantidad = Number(m.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) throw new ErrorNegocio("La cantidad debe ser un número entero mayor que cero.");
    const def = TIPOS_MOV[m.tipo];
    if (!def) throw new ErrorNegocio("Tipo de movimiento no válido.");
    const signo = m.signo || def.signo;
    if (!signo) throw new ErrorNegocio("Movimiento sin dirección definida.");
    const antes = p.cantidad;
    const despues = antes + signo * cantidad;
    if (despues < 0) throw new ErrorNegocio(`No hay existencias suficientes de "${p.nombre}". Disponibles: ${antes}.`, "STOCK");
    p.cantidad = despues; p.actualizado = U.ahora();
    const mov = {
      id: U.id(), fecha: m.fecha || U.hoy(), creado: U.ahora(), productoId: p.id, producto: p.nombre, codigo: p.codigo, tipo: m.tipo,
      cantidad, delta: signo * cantidad, antes, despues, nota: cadena(m.nota, 300),
      origenTipo: m.origenTipo || "", origenId: m.origenId || null, origenNumero: m.origenNumero || "", reversadoPor: null, revierteA: m.revierteA || null
    };
    d.movimientos.unshift(mov);
    return mov;
  }
  function registrarMovimiento(i) {
    return Store.transaccion((d) => {
      const def = TIPOS_MOV[i.tipo];
      if (!def || !def.manual) throw new ErrorNegocio("Elige un tipo de movimiento válido.");
      if (!productoDe(d, i.productoId)) throw new ErrorNegocio("Selecciona un producto válido.");
      const cantidad = Number(i.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 1) throw new ErrorNegocio("La cantidad debe ser un número entero mayor que cero.");
      const nota = cadena(i.nota, 300);
      if ((i.tipo === "ajuste_positivo" || i.tipo === "ajuste_negativo") && !nota) throw new ErrorNegocio("Los ajustes requieren un motivo en las observaciones.");
      const fecha = exigirFecha(i.fecha || U.hoy(), "del movimiento");
      return aplicarMovimiento(d, { productoId: i.productoId, tipo: i.tipo, cantidad, nota, fecha, origenTipo: i.documento ? "documento" : "", origenNumero: cadena(i.documento, 60) });
    });
  }
  /** Corrige un movimiento manual creando otro en sentido contrario (el original no se modifica). */
  function revertirMovimiento(id, motivo) {
    return Store.transaccion((d) => {
      const m = d.movimientos.find((x) => x.id === id);
      if (!m) throw new ErrorNegocio("Movimiento no encontrado.");
      const def = TIPOS_MOV[m.tipo];
      if (!def || !def.manual) throw new ErrorNegocio("Este movimiento proviene de otro documento (venta, compra o inventario inicial). Corrígelo desde ese documento o con un ajuste.");
      if (m.reversadoPor) throw new ErrorNegocio("Este movimiento ya fue revertido.");
      if (m.revierteA) throw new ErrorNegocio("No se puede revertir un movimiento que ya es una reversión.");
      const razon = cadena(motivo, 300);
      if (!razon) throw new ErrorNegocio("Escribe el motivo de la reversión.");
      const inverso = aplicarMovimiento(d, { productoId: m.productoId, tipo: "reversion", signo: -Math.sign(m.delta), cantidad: m.cantidad, nota: `Reversión: ${razon}`, origenTipo: "movimiento", origenId: m.id, revierteA: m.id });
      m.reversadoPor = inverso.id;
      return inverso;
    });
  }
  /** Verifica que existencias = suma de movimientos. */
  function verificarCoherencia(d) {
    const problemas = [];
    d.productos.forEach((p) => {
      const suma = d.movimientos.filter((m) => m.productoId === p.id).reduce((s, m) => s + (Number(m.delta) || 0), 0);
      if (suma !== p.cantidad) problemas.push({ productoId: p.id, nombre: p.nombre, existencias: p.cantidad, sumaMovimientos: suma });
    });
    return problemas;
  }

  /* ---------- Líneas de documentos ---------- */
  function normalizarItems(d, items, { modo, usarPreciosDados = false, soloActivos = true }) {
    if (!Array.isArray(items) || !items.length) throw new ErrorNegocio("Agrega al menos un producto.");
    const mapa = new Map();
    items.forEach((it) => {
      const p = productoDe(d, it.productoId);
      if (!p) throw new ErrorNegocio("Uno de los productos ya no existe.");
      if (soloActivos && p.activo === false) throw new ErrorNegocio(`El producto "${p.nombre}" está inactivo.`);
      const cantidad = Number(it.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 1) throw new ErrorNegocio(`La cantidad de "${p.nombre}" debe ser un entero mayor que cero.`);
      let unit;
      if (modo === "costo") unit = Number(it.costoUnitario);
      else unit = usarPreciosDados && it.precioUnitario != null ? Number(it.precioUnitario) : p.precio;
      if (!Number.isInteger(unit) || unit < 0) throw new ErrorNegocio(`El valor unitario de "${p.nombre}" no es válido.`);
      if (mapa.has(p.id)) mapa.get(p.id).cantidad += cantidad;
      else mapa.set(p.id, { productoId: p.id, nombre: p.nombre, codigo: p.codigo, cantidad, [modo === "costo" ? "costoUnitario" : "precioUnitario"]: unit });
    });
    return [...mapa.values()].map((it) => {
      const unit = modo === "costo" ? it.costoUnitario : it.precioUnitario;
      const base = { ...it, subtotal: unit * it.cantidad };
      return modo === "costo" ? { ...base, recibida: 0 } : base;
    });
  }

  /* ---------- Clientes y proveedores ---------- */
  function guardarTercero(lista, i, { etiqueta, campoDoc, extra }) {
    return Store.transaccion((d) => {
      const arr = d[lista];
      const id = i.id || null;
      const actual = id ? arr.find((x) => x.id === id) : null;
      if (id && !actual) throw new ErrorNegocio(`No se encontró el ${etiqueta} que intentas editar.`);
      const nombre = cadena(i.nombre, 140);
      if (!nombre) throw new ErrorNegocio(`El nombre o razón social del ${etiqueta} es obligatorio.`);
      const datos = { nombre, [campoDoc]: cadena(i[campoDoc], 40), telefono: cadena(i.telefono, 20), correo: cadena(i.correo, 120), direccion: cadena(i.direccion, 200), observaciones: cadena(i.observaciones, 500) };
      extra.forEach((k) => { datos[k] = cadena(i[k], 140); });
      validarContacto(datos);
      const otros = arr.filter((x) => x.id !== id);
      if (datos[campoDoc] && otros.some((x) => U.normalizar(x[campoDoc]) === U.normalizar(datos[campoDoc]))) throw new ErrorNegocio(`Ya existe un ${etiqueta} con ese documento o identificación.`, "DUPLICADO");
      if (!i.forzar && otros.some((x) => U.normalizar(x.nombre) === U.normalizar(nombre))) throw new ErrorNegocio(`Ya existe un ${etiqueta} con el mismo nombre. Si es otra persona o empresa, confirma para guardarlo igualmente.`, "POSIBLE_DUPLICADO");
      if (actual) return Object.assign(actual, datos, { actualizado: U.ahora() });
      const nuevo = { id: U.id(), ...datos, activo: true, creado: U.ahora() };
      arr.unshift(nuevo);
      return nuevo;
    });
  }
  const guardarCliente = (i) => guardarTercero("clientes", i, { etiqueta: "cliente", campoDoc: "documento", extra: [] });
  const guardarProveedor = (i) => guardarTercero("proveedores", i, { etiqueta: "proveedor", campoDoc: "identificacion", extra: ["contacto"] });
  function cambiarActivoTercero(lista, id, activo) {
    return Store.transaccion((d) => {
      const x = d[lista].find((r) => r.id === id); if (!x) throw new ErrorNegocio("Registro no encontrado.");
      x.activo = !!activo; return x;
    });
  }
  function resumenCliente(d, id) {
    const ventas = d.ventas.filter((v) => v.clienteId === id);
    const confirmadas = ventas.filter((v) => v.estado === "confirmada");
    return { ventas, pedidos: d.pedidos.filter((o) => o.clienteId === id), totalCompras: U.suma(confirmadas, (v) => v.total), cantidadVentas: confirmadas.length, saldo: U.suma(confirmadas, (v) => saldoVenta(v)) };
  }
  function resumenProveedor(d, id) {
    const compras = d.compras.filter((c) => c.proveedorId === id);
    const ids = new Set(compras.map((c) => c.id));
    return {
      compras, productos: d.productos.filter((p) => (p.proveedorIds || []).includes(id)),
      movimientos: d.movimientos.filter((m) => m.origenTipo === "compra" && ids.has(m.origenId)),
      totalRecibido: U.suma(compras, (c) => U.suma(c.recepciones || [], (r) => r.valor))
    };
  }

  /* ---------- Ventas ---------- */
  function crearVentaEn(d, i, { usarPrecios = false } = {}) {
    const fecha = exigirFecha(i.fecha || U.hoy(), "de la venta");
    const items = normalizarItems(d, i.items, { modo: "precio", usarPreciosDados: usarPrecios });
    const faltan = items.filter((it) => productoDe(d, it.productoId).cantidad < it.cantidad);
    if (faltan.length) throw new ErrorNegocio("Existencias insuficientes: " + faltan.map((it) => `${it.nombre} (pides ${it.cantidad}, hay ${productoDe(d, it.productoId).cantidad})`).join("; ") + ".", "STOCK");
    const subtotal = U.suma(items, (it) => it.subtotal);
    const descuento = i.descuento === "" || i.descuento == null ? 0 : Number(i.descuento);
    if (!Number.isInteger(descuento) || descuento < 0) throw new ErrorNegocio("El descuento debe ser un entero mayor o igual a cero.");
    if (descuento > 0 && !d.config.permitirDescuentos) throw new ErrorNegocio("Los descuentos están desactivados en Configuración.");
    if (descuento > subtotal) throw new ErrorNegocio("El descuento no puede ser mayor que el subtotal.");
    let cliente = null;
    if (i.clienteId) { cliente = clienteDe(d, i.clienteId); if (!cliente) throw new ErrorNegocio("El cliente seleccionado no existe."); }
    const metodoPago = i.metodoPago && METODOS_PAGO.includes(i.metodoPago) ? i.metodoPago : "";
    const total = subtotal - descuento;
    const condicion = i.condicion === "credito" ? "credito" : "contado";
    let vencimiento = "", abono = 0;
    if (condicion === "credito") {
      if (!cliente) throw new ErrorNegocio("Las ventas a crédito requieren un cliente identificado.");
      if (i.vencimiento) {
        exigirFecha(i.vencimiento, "de vencimiento");
        if (i.vencimiento < fecha) throw new ErrorNegocio("La fecha de vencimiento no puede ser anterior a la fecha de la venta.");
        vencimiento = i.vencimiento;
      }
      abono = i.abono === "" || i.abono == null ? 0 : Number(i.abono);
      if (!Number.isInteger(abono) || abono < 0) throw new ErrorNegocio("El abono inicial debe ser un entero mayor o igual a cero.");
      if (abono > total) throw new ErrorNegocio("El abono inicial no puede superar el total de la venta.");
    }
    const valorPago = condicion === "contado" ? total : abono;
    const pagos = valorPago > 0 ? [nuevoPago({ fecha, valor: valorPago, metodoPago, nota: condicion === "contado" ? "Pago de contado" : "Abono inicial" })] : [];
    const numero = siguienteNumero(d, "venta", "V");
    const venta = {
      id: U.id(), numero, token: i.token || null, fecha, creado: U.ahora(), clienteId: cliente ? cliente.id : null, clienteNombre: cliente ? cliente.nombre : "",
      items, subtotal, descuento, total, metodoPago, observaciones: cadena(i.observaciones, 300), estado: "confirmada", pedidoId: i.pedidoId || null, condicion, vencimiento, pagos
    };
    items.forEach((it) => aplicarMovimiento(d, { productoId: it.productoId, tipo: "venta", cantidad: it.cantidad, fecha, nota: `Venta ${numero}`, origenTipo: "venta", origenId: venta.id, origenNumero: numero }));
    d.ventas.unshift(venta);
    return venta;
  }
  function crearVenta(i) {
    return Store.transaccion((d) => {
      if (i.token && d.ventas.some((v) => v.token === i.token)) throw new ErrorNegocio("Esta venta ya fue registrada; no se descontó el inventario otra vez.", "DUPLICADA");
      return crearVentaEn(d, i);
    });
  }
  function anularVenta(id, motivo) {
    return Store.transaccion((d) => {
      const v = d.ventas.find((x) => x.id === id);
      if (!v) throw new ErrorNegocio("Venta no encontrada.");
      if (v.estado !== "confirmada") throw new ErrorNegocio("Esta venta ya estaba anulada.");
      const razon = cadena(motivo, 300);
      if (!razon) throw new ErrorNegocio("Escribe el motivo de la anulación.");
      v.items.forEach((it) => {
        if (!productoDe(d, it.productoId)) throw new ErrorNegocio("Un producto de la venta ya no existe; no se puede revertir el inventario.");
        aplicarMovimiento(d, { productoId: it.productoId, tipo: "anulacion_venta", cantidad: it.cantidad, nota: `Anulación de ${v.numero}: ${razon}`, origenTipo: "venta", origenId: v.id, origenNumero: v.numero });
      });
      (v.pagos || []).forEach((p) => { if (p.estado !== "anulado") { p.estado = "anulado"; p.motivoAnulacion = "Venta anulada"; } });
      v.estado = "anulada"; v.motivoAnulacion = razon; v.anulada = U.ahora();
      if (v.pedidoId) {
        const o = d.pedidos.find((x) => x.id === v.pedidoId);
        if (o && o.ventaId === v.id) {
          o.historial.push({ fecha: U.ahora(), de: "entregado", a: "listo", nota: `Venta ${v.numero} anulada` });
          o.estado = "listo"; o.ventaId = null; o.ventaNumero = "";
        }
      }
      return v;
    });
  }

  /* ---------- Cobros y cartera ---------- */
  const ESTADOS_COBRO = { pendiente: "Pendiente", parcial: "Pago parcial", pagada: "Pagada", anulada: "Anulada" };
  function nuevoPago({ token, fecha, valor, metodoPago, nota }) {
    return { id: U.id(), token: token || null, fecha, valor, metodoPago: METODOS_PAGO.includes(metodoPago) ? metodoPago : "", nota: cadena(nota, 300), creado: U.ahora(), estado: "activo" };
  }
  const pagosActivos = (v) => (Array.isArray(v.pagos) ? v.pagos.filter((p) => p.estado !== "anulado") : []);
  /** Las ventas anteriores al módulo de cobros (sin "pagos") se consideran pagadas por completo. */
  const pagadoVenta = (v) => (Array.isArray(v.pagos) ? U.suma(pagosActivos(v), (p) => p.valor) : v.total);
  const saldoVenta = (v) => (v.estado !== "confirmada" ? 0 : Math.max(0, v.total - pagadoVenta(v)));
  function estadoCobro(v) {
    if (v.estado !== "confirmada") return "anulada";
    if (saldoVenta(v) <= 0) return "pagada";
    return pagadoVenta(v) > 0 ? "parcial" : "pendiente";
  }
  const estaVencida = (v, hoy) => saldoVenta(v) > 0 && !!v.vencimiento && v.vencimiento < (hoy || U.hoy());
  const diasEntre = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
  function registrarPago(ventaId, i) {
    return Store.transaccion((d) => {
      const v = d.ventas.find((x) => x.id === ventaId);
      if (!v) throw new ErrorNegocio("Venta no encontrada.");
      if (v.estado !== "confirmada") throw new ErrorNegocio("No se pueden registrar abonos en una venta anulada.");
      if (!Array.isArray(v.pagos)) throw new ErrorNegocio("Esta venta es anterior al módulo de cobros y se considera pagada.");
      if (i.token && v.pagos.some((p) => p.token === i.token)) throw new ErrorNegocio("Este abono ya fue registrado; no se sumó otra vez.", "DUPLICADA");
      const fecha = exigirFecha(i.fecha || U.hoy(), "del abono");
      if (fecha < v.fecha) throw new ErrorNegocio("La fecha del abono no puede ser anterior a la fecha de la venta.");
      const valor = Number(i.valor);
      if (!Number.isInteger(valor) || valor < 1) throw new ErrorNegocio("El valor del abono debe ser un entero mayor que cero.");
      const saldo = saldoVenta(v);
      if (saldo <= 0) throw new ErrorNegocio("Esta venta no tiene saldo pendiente.");
      if (valor > saldo) throw new ErrorNegocio(`El abono (${U.dinero(valor)}) supera el saldo pendiente (${U.dinero(saldo)}).`);
      v.pagos.push(nuevoPago({ token: i.token, fecha, valor, metodoPago: i.metodoPago, nota: i.nota }));
      return v;
    });
  }
  function anularPago(ventaId, pagoId, motivo) {
    return Store.transaccion((d) => {
      const v = d.ventas.find((x) => x.id === ventaId);
      if (!v || !Array.isArray(v.pagos)) throw new ErrorNegocio("Venta no encontrada.");
      if (v.estado !== "confirmada") throw new ErrorNegocio("La venta está anulada.");
      const p = v.pagos.find((x) => x.id === pagoId);
      if (!p) throw new ErrorNegocio("Abono no encontrado.");
      if (p.estado === "anulado") throw new ErrorNegocio("Este abono ya estaba anulado.");
      const razon = cadena(motivo, 300); if (!razon) throw new ErrorNegocio("Escribe el motivo de la anulación del abono.");
      p.estado = "anulado"; p.motivoAnulacion = razon; p.anulado = U.ahora();
      return v;
    });
  }
  function cambiarVencimiento(ventaId, fecha) {
    return Store.transaccion((d) => {
      const v = d.ventas.find((x) => x.id === ventaId);
      if (!v || v.estado !== "confirmada" || !Array.isArray(v.pagos)) throw new ErrorNegocio("No se puede cambiar el vencimiento de esta venta.");
      if (fecha) { exigirFecha(fecha, "de vencimiento"); if (fecha < v.fecha) throw new ErrorNegocio("El vencimiento no puede ser anterior a la fecha de la venta."); }
      v.vencimiento = fecha || "";
      return v;
    });
  }
  /** Ventas con saldo pendiente (cuentas por cobrar). Filtros: fechas de la venta y cliente. */
  function cartera(d, f = {}) {
    const hoy = U.hoy();
    return d.ventas.filter((v) => saldoVenta(v) > 0 && enRango(v.fecha, f) && (!f.clienteId || v.clienteId === f.clienteId))
      .map((v) => { const vencida = estaVencida(v, hoy); return { venta: v, saldo: saldoVenta(v), pagado: pagadoVenta(v), vencida, dias: vencida ? diasEntre(v.vencimiento, hoy) : 0 }; })
      .sort((a, b) => Number(b.vencida) - Number(a.vencida) || String(a.venta.vencimiento || "9999").localeCompare(String(b.venta.vencimiento || "9999")) || String(a.venta.fecha).localeCompare(String(b.venta.fecha)));
  }
  function resumenCartera(d) {
    const c = cartera(d); const porCliente = new Map();
    c.forEach((x) => {
      const k = x.venta.clienteId || "sin";
      const r = porCliente.get(k) || { clienteId: x.venta.clienteId, cliente: x.venta.clienteNombre || "Sin cliente", ventas: 0, saldo: 0, vencido: 0 };
      r.ventas++; r.saldo += x.saldo; if (x.vencida) r.vencido += x.saldo; porCliente.set(k, r);
    });
    return { total: U.suma(c, (x) => x.saldo), vencido: U.suma(c.filter((x) => x.vencida), (x) => x.saldo), cantidad: c.length, vencidas: c.filter((x) => x.vencida).length, porCliente: [...porCliente.values()].sort((a, b) => b.saldo - a.saldo) };
  }

  /* ---------- Pedidos ---------- */
  function guardarPedido(i) {
    return Store.transaccion((d) => {
      const id = i.id || null;
      const actual = id ? d.pedidos.find((o) => o.id === id) : null;
      if (id && !actual) throw new ErrorNegocio("Pedido no encontrado.");
      if (actual && !["pendiente", "confirmado"].includes(actual.estado)) throw new ErrorNegocio("Solo se pueden editar pedidos pendientes o confirmados.");
      const cliente = clienteDe(d, i.clienteId);
      if (!cliente) throw new ErrorNegocio("Selecciona un cliente para el pedido.");
      if (cliente.activo === false && (!actual || actual.clienteId !== cliente.id)) throw new ErrorNegocio("El cliente seleccionado está desactivado.");
      const fecha = exigirFecha(i.fecha || U.hoy(), "del pedido");
      // Si el producto ya estaba en el pedido se respeta el precio acordado; los nuevos usan el precio actual.
      const previos = new Map((actual ? actual.items : []).map((it) => [it.productoId, it.precioUnitario]));
      const dados = (i.items || []).map((it) => ({ ...it, precioUnitario: previos.has(it.productoId) ? previos.get(it.productoId) : null }));
      const items = normalizarItems(d, dados, { modo: "precio", usarPreciosDados: true });
      const total = U.suma(items, (it) => it.subtotal);
      const base = { fecha, clienteId: cliente.id, clienteNombre: cliente.nombre, items, total, observaciones: cadena(i.observaciones, 300) };
      if (actual) { Object.assign(actual, base, { actualizado: U.ahora() }); return actual; }
      const numero = siguienteNumero(d, "pedido", "P");
      const o = { id: U.id(), numero, creado: U.ahora(), ...base, estado: "pendiente", ventaId: null, ventaNumero: "", historial: [{ fecha: U.ahora(), de: null, a: "pendiente", nota: "Pedido creado" }] };
      d.pedidos.unshift(o);
      return o;
    });
  }
  function cambiarEstadoPedido(id, nuevo, nota) {
    return Store.transaccion((d) => {
      const o = d.pedidos.find((x) => x.id === id);
      if (!o) throw new ErrorNegocio("Pedido no encontrado.");
      if (nuevo === "entregado") throw new ErrorNegocio('Para entregar un pedido usa "Entregar y generar venta".');
      if (!(TRANSICIONES_PEDIDO[o.estado] || []).includes(nuevo)) throw new ErrorNegocio(`No se puede pasar de "${ESTADOS_PEDIDO[o.estado]}" a "${ESTADOS_PEDIDO[nuevo] || nuevo}".`);
      o.historial.push({ fecha: U.ahora(), de: o.estado, a: nuevo, nota: cadena(nota, 300) });
      o.estado = nuevo; o.actualizado = U.ahora();
      return o;
    });
  }
  /** Entrega el pedido: crea UNA venta, descuenta el inventario UNA vez y enlaza ambos documentos. */
  function entregarPedido(id, { metodoPago, condicion, abono, vencimiento } = {}) {
    return Store.transaccion((d) => {
      const o = d.pedidos.find((x) => x.id === id);
      if (!o) throw new ErrorNegocio("Pedido no encontrado.");
      if (o.ventaId) throw new ErrorNegocio(`Este pedido ya generó la venta ${o.ventaNumero}.`, "DUPLICADA");
      if (o.estado !== "listo") throw new ErrorNegocio('Solo se puede entregar un pedido en estado "Listo".');
      const venta = crearVentaEn(d, { fecha: U.hoy(), clienteId: o.clienteId, items: o.items, descuento: 0, metodoPago, condicion, abono, vencimiento, observaciones: `Generada desde el pedido ${o.numero}`, pedidoId: o.id }, { usarPrecios: true });
      o.historial.push({ fecha: U.ahora(), de: "listo", a: "entregado", nota: `Venta ${venta.numero}` });
      o.estado = "entregado"; o.ventaId = venta.id; o.ventaNumero = venta.numero; o.actualizado = U.ahora();
      return { pedido: o, venta };
    });
  }
  function disponibilidadPedido(d, o) {
    return o.items.map((it) => {
      const p = productoDe(d, it.productoId);
      const stock = p ? p.cantidad : 0;
      const otros = comprometido(d, it.productoId, o.id);
      return { productoId: it.productoId, nombre: it.nombre, requerido: it.cantidad, stock, comprometidoOtros: otros, suficiente: stock >= it.cantidad, sinConflicto: stock - otros >= it.cantidad };
    });
  }

  /* ---------- Compras ---------- */
  function guardarCompra(i) {
    return Store.transaccion((d) => {
      const id = i.id || null;
      const actual = id ? d.compras.find((c) => c.id === id) : null;
      if (id && !actual) throw new ErrorNegocio("Compra no encontrada.");
      if (actual && (!["borrador", "pendiente"].includes(actual.estado) || (actual.recepciones || []).length)) throw new ErrorNegocio("Solo se pueden editar compras en borrador o pendientes sin recepciones.");
      const prov = proveedorDe(d, i.proveedorId);
      if (!prov) throw new ErrorNegocio("Selecciona un proveedor.");
      if (prov.activo === false && (!actual || actual.proveedorId !== prov.id)) throw new ErrorNegocio("El proveedor seleccionado está desactivado.");
      const estado = i.estado === "borrador" ? "borrador" : "pendiente";
      const fecha = exigirFecha(i.fecha || U.hoy(), "de la compra");
      const items = normalizarItems(d, i.items, { modo: "costo" });
      const base = { proveedorId: prov.id, proveedorNombre: prov.nombre, documento: cadena(i.documento, 60), fecha, items, total: U.suma(items, (it) => it.subtotal), estado, observaciones: cadena(i.observaciones, 300) };
      if (actual) { Object.assign(actual, base, { actualizado: U.ahora() }); return actual; }
      const numero = siguienteNumero(d, "compra", "C");
      const c = { id: U.id(), numero, creado: U.ahora(), ...base, recepciones: [] };
      d.compras.unshift(c);
      return c;
    });
  }
  function cambiarEstadoCompra(id, nuevo, motivo) {
    return Store.transaccion((d) => {
      const c = d.compras.find((x) => x.id === id);
      if (!c) throw new ErrorNegocio("Compra no encontrada.");
      if (nuevo === "pendiente") {
        if (c.estado !== "borrador") throw new ErrorNegocio("Solo un borrador puede pasar a pendiente de recepción.");
      } else if (nuevo === "cancelada") {
        if (!["borrador", "pendiente"].includes(c.estado) || (c.recepciones || []).length) throw new ErrorNegocio("Solo se pueden cancelar compras sin mercancía recibida.");
        c.motivoCancelacion = cadena(motivo, 300);
      } else throw new ErrorNegocio("Estado no permitido.");
      c.estado = nuevo; c.actualizado = U.ahora();
      return c;
    });
  }
  /** Recibe mercancía. "token" evita que la misma recepción se procese dos veces. */
  function recibirCompra(id, { token, fecha, nota, lineas, actualizarCostos }) {
    return Store.transaccion((d) => {
      const c = d.compras.find((x) => x.id === id);
      if (!c) throw new ErrorNegocio("Compra no encontrada.");
      if (!["pendiente", "parcial"].includes(c.estado)) throw new ErrorNegocio("Solo se puede recibir mercancía de compras pendientes o con recepción parcial.");
      if (token && c.recepciones.some((r) => r.token === token)) throw new ErrorNegocio("Esta recepción ya fue registrada; no se sumó el inventario otra vez.", "DUPLICADA");
      const f = exigirFecha(fecha || U.hoy(), "de la recepción");
      const usadas = (lineas || []).filter((l) => Number(l.cantidad) > 0);
      if (!usadas.length) throw new ErrorNegocio("Indica la cantidad recibida de al menos un producto.");
      const recepcion = { id: U.id(), token: token || null, fecha: f, creado: U.ahora(), nota: cadena(nota, 300), items: [], valor: 0, movimientoIds: [] };
      usadas.forEach((l) => {
        const it = c.items.find((x) => x.productoId === l.productoId);
        if (!it) throw new ErrorNegocio("Un producto recibido no pertenece a esta compra.");
        const cant = Number(l.cantidad);
        if (!Number.isInteger(cant) || cant < 1) throw new ErrorNegocio(`Cantidad inválida para "${it.nombre}".`);
        const pendiente = it.cantidad - it.recibida;
        if (cant > pendiente) throw new ErrorNegocio(`"${it.nombre}": solo faltan ${pendiente} por recibir.`);
        const mov = aplicarMovimiento(d, { productoId: it.productoId, tipo: "compra", cantidad: cant, fecha: f, nota: `Recepción de ${c.numero}`, origenTipo: "compra", origenId: c.id, origenNumero: c.numero });
        it.recibida += cant;
        recepcion.items.push({ productoId: it.productoId, cantidad: cant, costoUnitario: it.costoUnitario });
        recepcion.valor += cant * it.costoUnitario;
        recepcion.movimientoIds.push(mov.id);
        if (actualizarCostos) productoDe(d, it.productoId).costo = it.costoUnitario;
      });
      c.recepciones.push(recepcion);
      c.estado = c.items.every((x) => x.recibida >= x.cantidad) ? "recibida" : "parcial";
      c.actualizado = U.ahora();
      return c;
    });
  }

  /* ---------- Finanzas ---------- */
  function guardarMovimientoFinanciero(i) {
    return Store.transaccion((d) => {
      const id = i.id || null;
      const actual = id ? d.finanzas.find((x) => x.id === id) : null;
      if (id && !actual) throw new ErrorNegocio("Movimiento no encontrado.");
      if (actual && actual.estado === "anulado") throw new ErrorNegocio("Un movimiento anulado no se puede editar.");
      const tipo = i.tipo === "ingreso" ? "ingreso" : i.tipo === "egreso" ? "egreso" : null;
      if (!tipo) throw new ErrorNegocio("Elige si es ingreso o gasto.");
      const concepto = cadena(i.concepto, 140);
      if (!concepto) throw new ErrorNegocio("El concepto es obligatorio.");
      const valor = Number(i.valor);
      if (!Number.isInteger(valor) || valor < 1) throw new ErrorNegocio("El importe debe ser un entero mayor que cero.");
      const fecha = exigirFecha(i.fecha, "del movimiento");
      const permitidas = tipo === "ingreso" ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO;
      const categoria = permitidas.includes(i.categoria) ? i.categoria : (tipo === "ingreso" ? "Otros ingresos" : "Otros gastos");
      const base = { tipo, concepto, valor, fecha, categoria, metodoPago: METODOS_PAGO.includes(i.metodoPago) ? i.metodoPago : "", observaciones: cadena(i.observaciones, 300) };
      if (actual) {
        const { id: _i, historial, ...previo } = actual;
        actual.historial = [...(actual.historial || []), { fecha: U.ahora(), antes: previo }];
        return Object.assign(actual, base, { actualizado: U.ahora() });
      }
      const nuevo = { id: U.id(), ...base, origen: "manual", estado: "activo", creado: U.ahora(), historial: [] };
      d.finanzas.unshift(nuevo);
      return nuevo;
    });
  }
  function anularMovimientoFinanciero(id, motivo) {
    return Store.transaccion((d) => {
      const x = d.finanzas.find((r) => r.id === id);
      if (!x) throw new ErrorNegocio("Movimiento no encontrado.");
      if (x.estado === "anulado") throw new ErrorNegocio("Este movimiento ya estaba anulado.");
      const razon = cadena(motivo, 300); if (!razon) throw new ErrorNegocio("Escribe el motivo de la anulación.");
      x.estado = "anulado"; x.motivoAnulacion = razon; x.anulado = U.ahora();
      return x;
    });
  }
  const enRango = (fecha, f) => {
    if (!fecha) return !f.desde && !f.hasta;
    return (!f.desde || fecha >= f.desde) && (!f.hasta || fecha <= f.hasta);
  };
  /**
   * Libro financiero: una sola fuente por operación.
   *  - Ventas confirmadas  -> ingreso (se leen de Ventas; no se guardan en Finanzas)
   *  - Recepciones de compra -> gasto  (se leen de Compras)
   *  - Movimientos manuales no anulados
   */
  function libroFinanzas(d, f = {}) {
    const filas = [];
    d.ventas.filter((v) => v.estado === "confirmada").forEach((v) => {
      const cli = v.clienteNombre ? " · " + v.clienteNombre : "";
      if (!Array.isArray(v.pagos)) filas.push({ clave: "venta:" + v.id, fecha: v.fecha, tipo: "ingreso", concepto: `Venta ${v.numero}${cli}`, valor: v.total, categoria: "Ventas cobradas", origen: "cobro", clienteId: v.clienteId || null, metodoPago: v.metodoPago || "", editable: false });
      else pagosActivos(v).forEach((p) => filas.push({ clave: "cobro:" + p.id, fecha: p.fecha, tipo: "ingreso", concepto: `Cobro ${v.numero}${cli}`, valor: p.valor, categoria: "Ventas cobradas", origen: "cobro", clienteId: v.clienteId || null, metodoPago: p.metodoPago || "", editable: false }));
    });
    d.compras.forEach((c) => (c.recepciones || []).forEach((r) => filas.push({ clave: "compra:" + r.id, fecha: r.fecha, tipo: "egreso", concepto: `Compra ${c.numero} · ${c.proveedorNombre}`, valor: r.valor, categoria: "Compras de mercancía", origen: "compra", metodoPago: "", editable: false })));
    d.finanzas.filter((x) => x.estado !== "anulado").forEach((x) => filas.push({ clave: "manual:" + x.id, id: x.id, fecha: x.fecha, tipo: x.tipo, concepto: x.concepto, valor: x.valor, categoria: x.categoria || (x.tipo === "ingreso" ? "Otros ingresos" : "Otros gastos"), origen: "manual", metodoPago: x.metodoPago || "", editable: true }));
    return filas
      .filter((r) => enRango(r.fecha, f) && (!f.tipo || r.tipo === f.tipo) && (!f.categoria || r.categoria === f.categoria) && (!f.origen || r.origen === f.origen))
      .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  }
  function resumenFinanzas(filas) {
    const ingresos = U.suma(filas.filter((r) => r.tipo === "ingreso"), (r) => r.valor);
    const egresos = U.suma(filas.filter((r) => r.tipo === "egreso"), (r) => r.valor);
    return { ingresos, egresos, neto: ingresos - egresos };
  }
  function resumenMensual(filas) {
    const m = new Map();
    filas.forEach((r) => {
      const k = r.fecha ? r.fecha.slice(0, 7) : "sin-fecha";
      if (!m.has(k)) m.set(k, { mes: k, ingresos: 0, egresos: 0, neto: 0 });
      const x = m.get(k);
      if (r.tipo === "ingreso") x.ingresos += r.valor; else x.egresos += r.valor;
      x.neto = x.ingresos - x.egresos;
    });
    return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }

  /* ---------- Configuración ---------- */
  function guardarConfig(i) {
    return Store.transaccion((d) => {
      const { MONEDAS, FORMATOS_FECHA } = global.MINY;
      if (!MONEDAS.includes(i.moneda)) throw new ErrorNegocio("Moneda no válida.");
      if (!FORMATOS_FECHA.includes(i.formatoFecha)) throw new ErrorNegocio("Formato de fecha no válido.");
      if (!esEnteroNoNeg(i.minimoDefecto)) throw new ErrorNegocio("El mínimo de existencias por defecto debe ser un entero mayor o igual a cero.");
      Object.assign(d.config, { negocio: cadena(i.negocio, 80), moneda: i.moneda, formatoFecha: i.formatoFecha, minimoDefecto: Number(i.minimoDefecto), permitirDescuentos: !!i.permitirDescuentos });
      return d.config;
    });
  }
  function restablecerConfig() {
    return Store.transaccion((d) => {
      const base = global.MINY.clon(global.MINY.CONFIG_DEFECTO);
      d.config = { ...base, consecutivos: d.config.consecutivos, ultimoRespaldo: d.config.ultimoRespaldo, ultimaMigracion: d.config.ultimaMigracion };
    });
  }

  global.MINY.Dominio = {
    ESTADOS_COBRO, pagosActivos, pagadoVenta, saldoVenta, estadoCobro, estaVencida, registrarPago, anularPago, cambiarVencimiento, cartera, resumenCartera,
    UNIDADES, METODOS_PAGO, CATEGORIAS_INGRESO, CATEGORIAS_EGRESO, TIPOS_MOV, ESTADOS_PEDIDO, TRANSICIONES_PEDIDO, ESTADOS_QUE_COMPROMETEN, ESTADOS_COMPRA,
    buscarProductos, coincideProducto, comprometido, nivelStock, margen, generarSKU, guardarProducto, cambiarActivoProducto, eliminarProducto, productoTieneHistorial,
    registrarMovimiento, revertirMovimiento, verificarCoherencia,
    guardarCliente, guardarProveedor, cambiarActivoTercero, resumenCliente, resumenProveedor,
    crearVenta, anularVenta, guardarPedido, cambiarEstadoPedido, entregarPedido, disponibilidadPedido,
    guardarCompra, cambiarEstadoCompra, recibirCompra,
    guardarMovimientoFinanciero, anularMovimientoFinanciero, libroFinanzas, resumenFinanzas, resumenMensual, enRango,
    guardarConfig, restablecerConfig, productoDe, clienteDe, proveedorDe
  };
})(typeof window !== "undefined" ? window : globalThis);
