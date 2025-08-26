// Fetch car data from local storage
const selectedCar = JSON.parse(localStorage.getItem("selectedCar"));

if (selectedCar) {
  document.getElementById("car-image").src = selectedCar.image;
  document.getElementById("car-name").textContent = selectedCar.name;
  document.getElementById("car-price").textContent = `kes${selectedCar.price} per day`;
} else {
  alert("No car selected. Redirecting to catalogue.");
  window.location.href = "cars.html";
}

document.getElementById("rentForm").addEventListener("submit", async function (e) {
  e.preventDefault();

  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const phone = document.getElementById("phone").value;
  const pickupDate = new Date(document.getElementById("pickup-date").value);
  const returnDate = new Date(document.getElementById("return-date").value);

  if (returnDate <= pickupDate) {
    alert("Return date must be after pickup date!");
    return;
  }

  const timeDifference = returnDate.getTime() - pickupDate.getTime();
  const days = Math.ceil(timeDifference / (1000 * 3600 * 24));
  const dailyPrice = parseFloat(selectedCar.price);
  const totalPrice = dailyPrice * days;

  const confirmBooking = confirm(`You are booking for ${days} days. Total price: kes${totalPrice}. Proceed to payment?`);
  if (!confirmBooking) return;

  try {
    // Create booking first
    const bookingResponse = await fetch("http://localhost:3000/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        car_id: selectedCar.id,
        start_date: pickupDate,
        end_date: returnDate,
        total_price: totalPrice,
        status: "pending"
      })
    });

    const bookingResult = await bookingResponse.json();

    if (!bookingResponse.ok) {
      alert(bookingResult.error || "Failed to save booking. Please try again.");
      return;
    }

    const bookingId = bookingResult.bookingId;
    console.log("Booking saved with ID:", bookingId);

    // 2. Initiate payment
    const paymentResponse = await fetch("http://localhost:3000/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phone,
        amount: totalPrice,
        bookingId: bookingId // optional, for webhook or post-payment update
      })
    });

    const paymentResult = await paymentResponse.json();
    console.log("Payment initiated:", paymentResult);

    alert("Payment prompt sent to your phone. Please complete the payment!");

    localStorage.removeItem("selectedCar");
    // Optionally redirect
    // window.location.href = "confirmation.html";

  } catch (error) {
    console.error("Error:", error);
    alert("Something went wrong. Please try again.");
  }
});