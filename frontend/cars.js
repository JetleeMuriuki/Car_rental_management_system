const searchInput = document.getElementById("search");
const filterSelect = document.getElementById("filter");
const catalogue = document.getElementById("catalogue");

let allCars = []; // all cars fetched from the database

// Load cars from backend
async function loadCars() {
    try {
        const response = await fetch('http://localhost:3000/cars'); // Backend API to get cars
        if (!response.ok) throw new Error('Failed to fetch cars');

        allCars = await response.json();
        displayCars(allCars); // Show all cars initially
    } catch (err) {
        console.error('Error loading cars:', err);
        catalogue.innerHTML = '<p style="color: red;">Failed to load cars. Please try again later.</p>';
    }
}

// Display a list of cars
function displayCars(cars) {
    catalogue.innerHTML = ''; // Clear previous

    cars.forEach(car => {
        const card = document.createElement('div');
        card.className = 'car-card';
        card.setAttribute('car-type', car.type);
        card.setAttribute('data-car-id', car.id);

        card.innerHTML = `
            <img src="${car.image}" alt="${car.name}">
            <h3>${car.name}</h3>
            <p>kes${car.price}/day</p>
            <button onclick="saveCarToLocalStorage(${car.id})">Rent Now</button>
        `;

        catalogue.appendChild(card);
    });
}

// Filter cars based on search and type
function filterCars() {
    const searchTerm = searchInput.value.toLowerCase();
    const filterType = filterSelect.value;

    const filteredCars = allCars.filter(car => {
        const carName = car.name.toLowerCase();
        const carType = car.type;
        const matchesSearch = carName.includes(searchTerm);
        const matchesFilter = filterType === "all" || carType === filterType;

        return matchesSearch && matchesFilter;
    });

    displayCars(filteredCars);
}

// Save selected car to local storage
function saveCarToLocalStorage(carId) {
    const selectedCar = allCars.find(car => car.id === carId);
    if (selectedCar) {
        localStorage.setItem("selectedCar", JSON.stringify(selectedCar));
        window.location.href = "rent.html"; // Redirect to Rent Now page
    }
}

// Update user display
function updateUserDisplay() {
    const userInfoDiv = document.getElementById('userInfo');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (user) {
        userInfoDiv.innerHTML = `
            <span>Welcome, ${user.email}</span>
            <button class="logout-btn" onclick="logout()">Logout</button>
        `;
    } else {
        userInfoDiv.innerHTML = '';
    }
}

// Logout user
function logout() {
  fetch('/auth/logout', { 
      method: 'POST',
      credentials: 'include'
  }).catch(err => console.error('Logout error:', err));
  
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  window.location.href = 'login.html';
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadCars();
    updateUserDisplay();
});

searchInput.addEventListener("input", filterCars);
filterSelect.addEventListener("change", filterCars);
