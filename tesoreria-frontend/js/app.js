const API_URL = "https://tesoreria-f5ng.onrender.com";

async function cargarTransacciones() {
  try {
    const res = await fetch(`${API_URL}/transacciones`);

    // Validar si la respuesta del servidor fue exitosa (código 200)
    if (!res.ok) {
      const errorServer = await res.json().catch(() => ({}));
      console.error("Error devuelto por la API:", errorServer);
      const tbody = document.getElementById('tblCuerpo');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">Error al conectar con la base de datos (${res.status}).</td></tr>`;
      }
      return;
    }

    const datos = await res.json();

    const tbody = document.getElementById('tblCuerpo');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    let balance = 0;

    // Verificar que datos sea una lista/array antes de operar sobre él
    if (!Array.isArray(datos) || datos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No hay transacciones registradas todavía.</td></tr>`;
      const lblBalance = document.getElementById('lblBalance');
      if (lblBalance) lblBalance.innerText = `₡0`;
      return;
    }

    datos.forEach(t => {
      if (t.tipo === 'INGRESO') balance += t.monto;
      else balance -= t.monto;

      const fechaFormateada = t.fecha ? new Date(t.fecha).toLocaleString('es-CR') : '-';

      const fila = `
        <tr>
          <td><small>${fechaFormateada}</small></td>
          <td><span class="badge ${t.tipo === 'INGRESO' ? 'bg-success' : 'bg-danger'}">${t.tipo}</span></td>
          <td>${t.medio_pago}</td>
          <td><strong>₡${t.monto ? t.monto.toLocaleString('es-CR') : '0'}</strong></td>
          <td><code>${t.comprobante || '-'}</code></td>
          <td>${t.descripcion || '-'}</td>
        </tr>
      `;
      tbody.innerHTML += fila;
    });

    const lblBalance = document.getElementById('lblBalance');
    if (lblBalance) {
      lblBalance.innerText = `₡${balance.toLocaleString('es-CR')}`;
    }
  } catch (err) {
    console.error("Error al cargar datos:", err);
  }
}

async function procesarImagenSINPE() {
  const fileInput = document.getElementById('inputSinpeImg');
  if (!fileInput.files[0]) return alert("Por favor selecciona una imagen primero.");

  const spinner = document.getElementById('spnCargando');
  const textoCargando = document.getElementById('spnTextoCargando');
  if (spinner) spinner.classList.remove('d-none');
  if (textoCargando) textoCargando.classList.remove('d-none');

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch(`${API_URL}/escanear-sinpe`, { method: 'POST', body: formData });
    
    if (!res.ok) {
      throw new Error(`Error en el escáner: ${res.status}`);
    }

    const data = await res.json();

    if (data.status === 'exito') {
      if (data.datos.monto) document.getElementById('txtMonto').value = data.datos.monto;
      if (data.datos.numero_comprobante) document.getElementById('txtRef').value = data.datos.numero_comprobante;
      if (data.datos.emisor_o_nota) document.getElementById('txtDetalle').value = `SINPE de: ${data.datos.emisor_o_nota}`;

      document.getElementById('selTipo').value = 'INGRESO';
      document.getElementById('selMedio').value = 'SINPE';
      alert("¡Imagen analizada! Verifica los datos extraídos y presiona Guardar.");
    }
  } catch (err) {
    alert("Error al procesar la imagen con Gemini.");
  } finally {
    if (spinner) spinner.classList.add('d-none');
    if (textoCargando) textoCargando.classList.add('d-none');
  }
}

async function guardarRegistro(e) {
  e.preventDefault();
  const btn = document.getElementById('btnGuardar');
  btn.disabled = true;
  btn.innerText = "Guardando...";

  const formData = new FormData();
  formData.append('monto', document.getElementById('txtMonto').value);
  formData.append('tipo', document.getElementById('selTipo').value);
  formData.append('medio_pago', document.getElementById('selMedio').value);
  formData.append('numero_comprobante', document.getElementById('txtRef').value);
  formData.append('descripcion', document.getElementById('txtDetalle').value);

  try {
    const res = await fetch(`${API_URL}/registrar`, { method: 'POST', body: formData });
    
    if (!res.ok) {
      alert("Hubo un problema al guardar la transacción.");
      return;
    }

    document.getElementById('formRegistro').reset();
    document.getElementById('inputSinpeImg').value = '';
    await cargarTransacciones();
  } catch (err) {
    alert("Error al guardar la transacción.");
  } finally {
    btn.disabled = false;
    btn.innerText = "Guardar En Base de Datos";
  }
}

// Cargar datos al entrar a la página
cargarTransacciones();
