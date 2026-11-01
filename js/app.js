"use strict";
/* MINY Logistics · ARRANQUE (fase 4): inicio de sesión con Supabase, carga de datos y navegación. */
(function (global) {
  const { U, Store, UI, Nube } = global.MINY;
  const $ = UI.$;
  let montado = false;
  let recuperando = false;

  /* ---------- Pantalla de acceso ---------- */
  function mensajeAuth(texto, tipo) {
    const el = $("authMensaje");
    if (!texto) { el.hidden = true; return; }
    el.textContent = texto; el.className = "auth-mensaje" + (tipo === "error" ? " error" : tipo === "ok" ? " ok" : ""); el.hidden = false;
  }
  function vistaAuth(nombre) {
    ["login", "registro", "recuperar", "nueva"].forEach((v) => { $(({ login: "formLogin", registro: "formRegistro", recuperar: "formRecuperar", nueva: "formNuevaClave" })[v]).hidden = v !== nombre; });
    $("authReintento").hidden = true;
    document.querySelectorAll(".auth-tab").forEach((b) => b.classList.toggle("active", b.dataset.auth === nombre));
    document.querySelector(".auth-tabs").hidden = nombre === "recuperar" || nombre === "nueva";
    mensajeAuth("");
  }
  function mostrarPortada(vista) {
    $("appShell").hidden = true; $("landingPage").hidden = false;
    $("authCargando").hidden = true; $("authBox").hidden = false;
    vistaAuth(vista || "login");
  }
  function mostrarCargando(texto) {
    $("appShell").hidden = true; $("landingPage").hidden = false;
    $("authBox").hidden = true; $("authCargando").hidden = false; $("authCargando").textContent = texto || "Cargando tus datos…";
  }
  function fatal(texto) {
    $("authCargando").hidden = true; $("authBox").hidden = false;
    ["formLogin", "formRegistro", "formRecuperar", "formNuevaClave"].forEach((f) => { $(f).hidden = true; });
    document.querySelector(".auth-tabs").hidden = true;
    mensajeAuth(texto, "error");
  }

  /* ---------- Aplicación ---------- */
  function marca() {
    const c = Store.leer().config;
    $("marcaNegocio").textContent = c.negocio || "Gestión de negocios";
    $("usuarioEmail").textContent = (Nube.usuario && Nube.usuario.email) || "";
  }
  async function entrar(id) {
    $("landingPage").hidden = true; $("appShell").hidden = false;
    marca();
    await UI.mostrar(id || "inicio");
  }
  function refrescarTodo() {
    marca();
    Object.values(UI.vistas).forEach((v) => { if (typeof v.limpiar === "function") { try { v.limpiar(); } catch (e) { console.error(e); } } });
    UI.refrescar();
  }
  function montarVistas() {
    if (montado) return;
    $("navPrincipal").innerHTML = UI.MODULOS.map((m) => `<button type="button" data-seccion="${m.id}" class="nav-btn"><span aria-hidden="true">${m.icono}</span> ${UI.esc(m.titulo)}</button>`).join("");
    const cont = $("modulos");
    UI.MODULOS.forEach((m) => {
      const sec = document.createElement("section");
      sec.id = "seccion-" + m.id; sec.className = "seccion"; sec.hidden = true;
      cont.appendChild(sec);
      UI.vistas[m.id].montar(sec);
    });
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-seccion],[data-ir]");
      if (!b || b.closest("#authBox")) return;
      if (b.tagName === "A") e.preventDefault();
      UI.mostrar(b.dataset.seccion || b.dataset.ir);
    });
    window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (UI.vistas[id] && !$("appShell").hidden && id !== UI.actual) UI.mostrar(id); });
    montado = true;
  }
  /** Descarga el negocio y los datos del usuario y entra a la aplicación. */
  async function arrancarApp() {
    mostrarCargando("Cargando tus datos…");
    try {
      await Nube.cargarNegocio();
      await Nube.refrescar();
    } catch (e) {
      mostrarPortada("login");
      mensajeAuth("No se pudieron cargar tus datos: " + e.message, "error");
      $("authReintento").hidden = false;
      return;
    }
    montarVistas();
    const inicial = location.hash.slice(1);
    await entrar(UI.vistas[inicial] ? inicial : "inicio");
  }

  /* ---------- Eventos de acceso ---------- */
  function conectarFormularios() {
    document.querySelectorAll("[data-auth]").forEach((b) => b.addEventListener("click", () => vistaAuth(b.dataset.auth)));
    const enviar = (form, boton, accion) => form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true; mensajeAuth("");
      try { await accion(); } catch (err) { mensajeAuth(err.message || String(err), "error"); } finally { btn.disabled = false; }
    });
    enviar($("formLogin"), null, async () => {
      const email = $("loginEmail").value.trim(), clave = $("loginClave").value;
      if (!email || !clave) throw new Error("Escribe tu correo y tu contraseña.");
      await Nube.entrar(email, clave);
      $("loginClave").value = "";
      await arrancarApp();
    });
    enviar($("formRegistro"), null, async () => {
      const negocio = $("regNegocio").value.trim(), email = $("regEmail").value.trim(), clave = $("regClave").value;
      if (!negocio) throw new Error("Escribe el nombre de tu negocio.");
      if (!email) throw new Error("Escribe tu correo electrónico.");
      if (clave.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
      const r = await Nube.registrar({ email, password: clave, negocio });
      $("regClave").value = "";
      if (r.sesion) { await arrancarApp(); return; }
      if (r.yaExistia) { mensajeAuth("Ese correo ya está registrado. Inicia sesión o recupera tu contraseña.", "error"); return; }
      vistaAuth("login"); $("loginEmail").value = email;
      mensajeAuth(`Cuenta creada. Te enviamos un correo a ${email}: ábrelo (revisa también spam) y pulsa el enlace para confirmarla. Después inicia sesión aquí.`, "ok");
    });
    enviar($("formRecuperar"), null, async () => {
      const email = $("recEmail").value.trim();
      if (!email) throw new Error("Escribe tu correo electrónico.");
      await Nube.enviarRecuperacion(email);
      mensajeAuth("Si ese correo está registrado, recibirás un enlace para crear una contraseña nueva.", "ok");
    });
    enviar($("formNuevaClave"), null, async () => {
      const clave = $("nuevaClave").value;
      if (clave.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
      await Nube.cambiarClave(clave);
      $("nuevaClave").value = ""; recuperando = false;
      await arrancarApp();
    });
    $("reintentarBtn").addEventListener("click", () => arrancarApp());
    $("cerrarSesionBtn").addEventListener("click", salir);
    $("salirBtn").addEventListener("click", salir);
    $("actualizarBtn").addEventListener("click", async () => { await UI.mostrar(UI.actual, true); UI.mensaje("Datos actualizados."); });
  }
  async function salir() {
    try { await Nube.salir(); } catch (e) { /* aunque falle la red, se limpia la sesión local */ }
    history.replaceState(null, "", location.pathname);
    location.reload();
  }

  async function iniciar() {
    try { Nube.iniciar(); }
    catch (e) { fatal(e.message); return; }
    conectarFormularios();
    // Importante: suscribirse antes de esperar la sesión para no perder el evento de recuperación de contraseña
    Nube.sb.auth.onAuthStateChange((evento) => {
      if (evento === "PASSWORD_RECOVERY") { recuperando = true; setTimeout(() => { mostrarPortada("nueva"); }, 0); }
    });
    let sesion = null;
    try { sesion = await Nube.sesion(); } catch (e) { fatal(e.message); return; }
    if (recuperando) return;
    if (sesion) await arrancarApp(); else mostrarPortada("login");
  }

  global.MINY.App = { refrescarTodo, entrar, arrancarApp };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})(window);
