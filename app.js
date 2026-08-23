const emailInput = document.getElementById("email");
const otpInput = document.getElementById("otp");

const sendOtpButton = document.getElementById("sendOtp");
const verifyOtpButton = document.getElementById("verifyOtp");

const otpSection = document.getElementById("otpSection");
const message = document.getElementById("message");

const SERVER_URL = "https://survivor-asus-excitement-openings.trycloudflare.com";


// ==============================
// KIRIM OTP
// ==============================

sendOtpButton.addEventListener("click", async () => {

  const email = emailInput.value.trim();

  if (!email) {
    message.textContent = "Masukkan email terlebih dahulu.";
    return;
  }

  sendOtpButton.disabled = true;
  message.textContent = "Mengirim OTP...";

  try {

    const response = await fetch(
      `${SERVER_URL}/api/send-otp`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          email: email
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      message.textContent =
        result.message || "Gagal mengirim OTP.";

      return;
    }

    otpSection.classList.remove("hidden");

    message.textContent =
      "OTP sudah dikirim ke email tersebut.";

  } catch (error) {

    console.error(error);

    message.textContent =
      "Server VEIL tidak dapat dihubungi.";

  } finally {

    sendOtpButton.disabled = false;

  }

});


// ==============================
// VERIFIKASI OTP
// ==============================

verifyOtpButton.addEventListener("click", async () => {

  const email = emailInput.value.trim();
  const otp = otpInput.value.trim();

  if (!email) {
    message.textContent =
      "Masukkan email terlebih dahulu.";
    return;
  }

  if (!otp) {
    message.textContent =
      "Masukkan kode OTP.";
    return;
  }

  verifyOtpButton.disabled = true;
  message.textContent = "Memverifikasi OTP...";

  try {

    const response = await fetch(
      `${SERVER_URL}/api/verify-otp`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          email: email,
          otp: otp
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {

      message.textContent =
        result.message || "OTP salah.";

      return;
    }

    message.textContent =
      "✅ Email berhasil diverifikasi.";

    setTimeout(() => {
      window.location.href = "dashboard.html";
    },  1000);

  } catch (error) {

    console.error(error);

    message.textContent =
      "Server VEIL tidak dapat dihubungi.";

  } finally {

    verifyOtpButton.disabled = false;

  }

});