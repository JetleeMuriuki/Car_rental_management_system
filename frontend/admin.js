document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  
  if (!token || !userStr) {
    return redirectToLogin('no-auth-data');
  }

  let user;
  try {
    user = JSON.parse(userStr);
    if (!user?.role) throw new Error('Invalid user data');
  } catch (e) {
    return redirectToLogin('invalid-session');
  }

  try {
    const response = await fetch('http://localhost:3000/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return redirectToLogin(error.error || 'session-verify-fail');
    }

    const { user: freshUser } = await response.json();
    
    if (freshUser.role !== 'admin') {
      return redirectToLogin('insufficient-permissions');
    }

    localStorage.setItem('user', JSON.stringify(freshUser));
    
    initAdminDashboard();
  } catch (error) {
    console.error('Admin init error:', error);
    redirectToLogin('network-error');
  }
});

function redirectToLogin(reason) {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = `login.html?error=${encodeURIComponent(reason)}`;
}

async function initAdminDashboard() {
  setupNavigation();
  setupAddCarModal();
  
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'login.html';
  });

  await loadAllData();
}

async function loadAllData() {
  const [dashboard, cars, bookings, users] = await Promise.all([
    fetchData('/admin/dashboard'),
    fetchData('/admin/cars'),
    fetchData('/admin/bookings'),
    fetchData('/admin/users')
  ]);

  renderDashboard(dashboard);
  renderCars(cars);
  renderBookings(bookings);
  renderUsers(users);

  showSection('dashboard');
}

async function fetchData(endpoint) {
  const token = localStorage.getItem('token');
  const response = await fetch(`http://localhost:3000${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
}

function renderDashboard(data) {
  document.getElementById('users-count').textContent = data.users;
  document.getElementById('cars-count').textContent = data.cars;
  document.getElementById('bookings-count').textContent = data.bookings;
}

function renderCars(cars) {
  document.getElementById('cars-table').innerHTML = cars.map(car => `
    <tr>
      <td><img src="${car.image}" class="car-thumbnail"></td>
      <td>${car.name}</td>
      <td>kes${car.price}/day</td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="editCar(${car.id})">Edit</button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteCar(${car.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

function renderBookings(bookings) {
  document.getElementById('bookings-table').innerHTML = bookings.map(b => `
    <tr>
      <td>${b.id}</td>
      <td>${b.user_name}</td>
      <td>${b.car_name}</td>
      <td>${new Date(b.start_date).toLocaleDateString()}</td>
      <td>${new Date(b.end_date).toLocaleDateString()}</td>
      <td>kes${b.total_price}</td>
      <td>
        <select onchange="updateBookingStatus(${b.id}, this.value)">
          <option value="pending" ${b.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="confirmed" ${b.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
          <option value="cancelled" ${b.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteBooking(${b.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

// Update booking status
window.updateBookingStatus = async (bookingId, status) => {
  try {
    await fetch(`/admin/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ status })
    });
    alert('Booking status updated');
  } catch (error) {
    console.error('Update booking error:', error);
    alert('Failed to update booking');
  }
};

//delete booking status
window.deleteBooking = async (bookingId) => {
  if (!confirm('Are you sure you want to delete this booking?')) return;

  try {
    await fetch(`/admin/bookings/${bookingId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    alert('Booking deleted');
    initAdminDashboard(); // Refresh data
  } catch (error) {
    console.error('Delete booking error:', error);
    alert('Failed to delete booking');
  }
};

function renderUsers(users) {
  document.getElementById('users-table').innerHTML = users.map(user => `
    <tr>
      <td>${user.id}</td>
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td>
        <select class="form-select" onchange="updateRole(${user.id}, this.value)">
          <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

//update user role
window.updateRole = async (userId, role) => {
  await fetch(`http://localhost:3000/admin/users/${userId}/role`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ role })
  });
};

//delete user
window.deleteUser = async (userId) => {
  if (!confirm('Are you sure you want to delete this user?')) return;

  try {
    await fetch(`/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    alert('User deleted');
    initAdminDashboard(); // Refresh data
  } catch (error) {
    console.error('Delete user error:', error);
    alert('Failed to delete user');
  }
};

function setupNavigation() {
  document.querySelectorAll('[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('[data-section]').forEach(l => l.classList.remove('active'));
      e.target.classList.add('active');
      showSection(e.target.dataset.section);
    });
  });
}

function showSection(sectionId) {
  document.querySelectorAll('section').forEach(section => {
    section.classList.toggle('hidden', section.id !== `${sectionId}-section`);
  });
}

// Setup the Add Car Modal
function setupAddCarModal() {
  const addCarBtn = document.getElementById('addCarBtn');
  const addCarModal = new bootstrap.Modal(document.getElementById('addCarModal'));
  const submitCarBtn = document.getElementById('submitCarBtn');
  const addCarForm = document.getElementById('addCarForm');

  addCarBtn.addEventListener('click', () => {
    addCarForm.reset();
    addCarModal.show();
  });

  submitCarBtn.addEventListener('click', async () => {
    const formData = new FormData(addCarForm); // Now properly captures files too!

    try {
      const response = await fetch(`http://localhost:3000/admin/cars`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
          //let browser set it automatically when using FormData
        },
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        alert('Car added successfully!');
        addCarModal.hide();
        await loadAllData(); // Refresh your car list
      } else {
        alert(result.message || 'Failed to add car');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Server error. Please try again.');
    }
  });
}

// Delete a car
window.deleteCar = async (id) => {
  if (!confirm('Are you sure you want to delete this car?')) return;

  await fetch(`http://localhost:3000/admin/cars/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });

  await loadAllData();
};

// Edit a car
window.editCar = async (id) => {
  const car = await fetchData(`/admin/cars/${id}`);
  const name = prompt('Update Car Name:', car.name);
  const price = prompt('Update Price per day:', car.price);
  const image = prompt('Update Image URL:', car.image);
  

  if (name && price && image) {
    await fetch(`http://localhost:3000/admin/cars/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ name, price, image })
    });

    await loadAllData();
  }
};