// Estado Global
let session = {
    role: '',
    vetId: ''
};

// Selectores
const loginForm = document.getElementById('login-form');
const roleSelect = document.getElementById('role-select');
const vetIdGroup = document.getElementById('vet-id-group');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginScreen = document.getElementById('login-screen');
const displayRole = document.getElementById('display-role');
const logoutBtn = document.getElementById('logout-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const petsBody = document.getElementById('pets-body');
const vaccinesBody = document.getElementById('vaccines-body');
const refreshVaccines = document.getElementById('refresh-vaccines');
const cacheIndicator = document.getElementById('cache-indicator');
const latencyVal = document.getElementById('latency-val');
const applyVaccineBtn = document.getElementById('apply-vaccine-test');

// --- Lógica de Vistas ---

roleSelect.addEventListener('change', (e) => {
    if (e.target.value === 'rol_veterinario') {
        vetIdGroup.classList.remove('hidden');
    } else {
        vetIdGroup.classList.add('hidden');
    }
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    session.role = roleSelect.value;
    session.vetId = document.getElementById('vet-id').value;

    displayRole.textContent = session.role.replace('rol_', '').toUpperCase();
    loginScreen.classList.remove('active');
    dashboardScreen.classList.add('active');

    // Inicializar datos
    fetchPets();
});

logoutBtn.addEventListener('logout-btn', () => {
    location.reload();
});

logoutBtn.onclick = () => location.reload();

// --- TABS ---
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
        
        if (btn.dataset.tab === 'vaccines') fetchVaccines();
    });
});

// --- API FETCH ---

async function fetchPets() {
    const query = searchInput.value;
    const url = query ? `/api/mascotas?nombre=${encodeURIComponent(query)}` : '/api/mascotas';
    
    try {
        const res = await fetch(url, {
            headers: {
                'x-role': session.role,
                'x-vet-id': session.vetId
            }
        });
        const data = await res.json();
        
        if (res.status !== 200) throw new Error(data.error);

        renderPets(data);
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function renderPets(pets) {
    petsBody.innerHTML = pets.map(p => `
        <tr>
            <td>${p.id}</td>
            <td>${p.nombre}</td>
            <td>${p.especie}</td>
            <td>${p.dueno_id}</td>
        </tr>
    `).join('');
}

async function fetchVaccines() {
    const startTime = performance.now();
    
    try {
        const res = await fetch('/api/vacunaciones-pendientes');
        const data = await res.json();
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        latencyVal.textContent = duration;

        // Comprobar Hit/Miss basándonos en la velocidad (heurística para la UI)
        // pero idealmente el backend podría enviar un header. 
        // Como el log del backend ya lo dice, aquí mostramos si fue rápido.
        if (duration < 30) {
            cacheIndicator.textContent = 'Estado: CACHE HIT (Redis)';
            cacheIndicator.className = 'indicator hit';
        } else {
            cacheIndicator.textContent = 'Estado: CACHE MISS (PostgreSQL)';
            cacheIndicator.className = 'indicator miss';
        }

        renderVaccines(data);
    } catch (err) {
        console.error(err);
    }
}

function renderVaccines(list) {
    vaccinesBody.innerHTML = list.map(v => `
        <tr>
            <td>${v.mascota_id}</td>
            <td>${v.mascota_nombre}</td>
            <td>${v.dueno_nombre}</td>
            <td>${v.telefono}</td>
        </tr>
    `).join('');
}

// --- Eventos ---
searchBtn.onclick = fetchPets;
searchInput.onkeyup = (e) => { if (e.key === 'Enter') fetchPets(); };
refreshVaccines.onclick = fetchVaccines;

applyVaccineBtn.onclick = async () => {
    try {
        const res = await fetch('/api/vacunas', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-role': 'rol_admin' // Forzamos admin para la prueba de invalidación
            },
            body: JSON.stringify({
                mascota_id: 1, // Firulais
                vacuna_id: 1,
                veterinario_id: 1,
                costo_cobrado: 350.00
            })
        });
        const data = await res.json();
        alert(data.message);
        // Actualizamos para ver el CACHE MISS
        fetchVaccines();
    } catch (err) {
        alert(err.message);
    }
};
