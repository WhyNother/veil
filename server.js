require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));

app.get("/device.html", (req, res) => {
    res.sendFile(
        path.join(__dirname, "device.html")
    );
});

// =====================================================
// STORAGE SEMENTARA
// =====================================================

// OTP sementara
const otpStore = new Map();


// Akun VEIL
//
// email -> {
//     emailVerified: true,
//     devices: Map()
// }
const accounts = new Map();


// Pairing code sementara
//
// code -> {
//     email,
//     createdAt,
//     expiresAt,
//     used,
//     deviceId,
//     deviceName,
//     pairedAt
// }
const pairingStore = new Map();



// =====================================================
// KONFIGURASI
// =====================================================

const MAX_DEVICES = 5;

// Pairing berlaku 5 menit
const PAIRING_DURATION = 5 * 60 * 1000;

// OTP berlaku 5 menit
const OTP_DURATION = 5 * 60 * 1000;


// =====================================================
// FUNGSI BANTU
// =====================================================

function normalizeEmail(email) {

    return String(email || "")
        .trim()
        .toLowerCase();

}


function createToken() {

    return crypto
        .randomBytes(32)
        .toString("hex");

}


function createDeviceId() {

    return crypto.randomUUID();

}


function generatePairingCode() {

    let code;

    do {

        code = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

    } while (pairingStore.has(code));

    return code;

}


// =====================================================
// HAPUS DATA EXPIRED
// =====================================================

setInterval(() => {

    const now = Date.now();


    // Hapus OTP expired

    for (const [email, data] of otpStore.entries()) {

        if (data.expiresAt < now) {

            otpStore.delete(email);

        }

    }


    // Hapus pairing expired

    for (const [code, data] of pairingStore.entries()) {

        if (data.expiresAt < now) {

            pairingStore.delete(code);

        }

    }

}, 60 * 1000);


// =====================================================
// KIRIM OTP
// =====================================================

app.post("/api/send-otp", async (req, res) => {

    try {

        const email =
            normalizeEmail(req.body.email);


        if (
            !email ||
            !email.includes("@")
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Email tidak valid."

            });

        }


        // OTP 6 digit

        const otp =
            Math.floor(
                100000 +
                Math.random() * 900000
            ).toString();


        otpStore.set(email, {

            otp: otp,

            expiresAt:
                Date.now() +
                OTP_DURATION,

            attempts: 0

        });


        const response =
            await fetch(
                "https://api.resend.com/emails",
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${process.env.RESEND_API_KEY}`

                    },

                    body: JSON.stringify({

                        from:
                            "VEIL <onboarding@resend.dev>",

                        to: [email],

                        subject:
                            "Kode OTP VEIL",

                        html: `

                            <div style="
                                font-family: Arial;
                                padding: 20px;
                            ">

                                <h2>
                                    VEIL Verification
                                </h2>

                                <p>
                                    Gunakan kode OTP
                                    berikut:
                                </p>

                                <div style="
                                    font-size: 32px;
                                    font-weight: bold;
                                    letter-spacing: 8px;
                                    margin: 25px 0;
                                ">
                                    ${otp}
                                </div>

                                <p>
                                    Kode berlaku
                                    selama
                                    <b>5 menit</b>.
                                </p>

                            </div>

                        `

                    })

                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            console.log(
                "Resend error:",
                result
            );

            return res.status(500).json({

                success: false,

                message:
                    "Gagal mengirim OTP."

            });

        }


        console.log(
            "OTP dikirim ke:",
            email
        );


        return res.json({

            success: true,

            message:
                "OTP berhasil dikirim."

        });


    } catch (error) {

        console.log(
            "Server error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Terjadi kesalahan server."

        });

    }

});


// =====================================================
// VERIFIKASI OTP
// =====================================================

app.post("/api/verify-otp", (req, res) => {

    const email =
        normalizeEmail(req.body.email);

    const otp =
        String(
            req.body.otp || ""
        ).trim();


    const data =
        otpStore.get(email);


    if (!data) {

        return res.status(400).json({

            success: false,

            message:
                "OTP tidak ditemukan atau sudah kedaluwarsa."

        });

    }


    if (
        Date.now() >
        data.expiresAt
    ) {

        otpStore.delete(email);

        return res.status(400).json({

            success: false,

            message:
                "OTP sudah kedaluwarsa."

        });

    }


    if (data.otp !== otp) {

        data.attempts++;


        if (data.attempts >= 5) {

            otpStore.delete(email);

            return res.status(429).json({

                success: false,

                message:
                    "Terlalu banyak percobaan."

            });

        }


        return res.status(400).json({

            success: false,

            message:
                "OTP salah."

        });

    }


    // OTP benar

    otpStore.delete(email);


    // Buat akun jika belum ada

    if (!accounts.has(email)) {

        accounts.set(email, {

            emailVerified: true,

            devices: new Map()

        });

    } else {

        accounts.get(email).emailVerified = true;

    }


    // Token sesi

    const accountToken =
        createToken();


    console.log(
        "Email terverifikasi:",
        email
    );


    return res.json({

        success: true,

        message:
            "Email berhasil diverifikasi.",

        email: email,

        accountToken:
            accountToken

    });

});


// =====================================================
// BUAT KODE PAIRING
// =====================================================

app.post("/api/create-pairing", (req, res) => {

    const email =
        normalizeEmail(req.body.email);


    if (!email) {

        return res.status(400).json({

            success: false,

            message:
                "Email diperlukan."

        });

    }


    const account =
        accounts.get(email);


    if (
        !account ||
        !account.emailVerified
    ) {

        return res.status(403).json({

            success: false,

            message:
                "Email belum diverifikasi."

        });

    }


    // Maksimal 5 perangkat

    if (
        account.devices.size >=
        MAX_DEVICES
    ) {

        return res.status(409).json({

            success: false,

            message:
                "Batas maksimal 5 perangkat sudah tercapai."

        });

    }


    const code =
        generatePairingCode();


    const now =
        Date.now();


    pairingStore.set(code, {

        email: email,

        createdAt: now,

        expiresAt:
            now +
            PAIRING_DURATION,

        used: false,

        deviceId: null,

        deviceName: null,

        pairedAt: null

    });


    console.log(
        "Kode pairing dibuat:",
        code,
        "untuk:",
        email
    );


    return res.json({

        success: true,

        code: code,

        expiresIn: 300

    });

});


// =====================================================
// STATUS KODE PAIRING
// =====================================================

app.get("/api/pair-status", (req, res) => {

    const code =
        String(
            req.query.code || ""
        ).trim();


    if (!/^\d{6}$/.test(code)) {

        return res.status(400).json({

            success: false,

            status: "invalid"

        });

    }


    const pairing =
        pairingStore.get(code);


    if (!pairing) {

        return res.json({

            success: true,

            status: "not_found"

        });

    }


    // Kalau sudah dipakai

    if (pairing.used === true) {

        return res.json({

            success: true,

            status: "paired",

            deviceId:
                pairing.deviceId,

            deviceName:
                pairing.deviceName ||
                "Perangkat VEIL",

            pairedAt:
                pairing.pairedAt

        });

    }


    // Kalau expired

    if (
        Date.now() >
        pairing.expiresAt
    ) {

        pairingStore.delete(code);

        return res.json({

            success: true,

            status: "expired"

        });

    }


    // Masih menunggu HP

    return res.json({

        success: true,

        status: "waiting",

        expiresAt:
            pairing.expiresAt

    });

});


// =====================================================
// HUBUNGKAN PERANGKAT
// =====================================================

app.post("/api/pair-device", (req, res) => {

    const code =
        String(
            req.body.code || ""
        ).trim();


    const deviceId =
        String(
            req.body.deviceId || ""
        ).trim();


    const deviceName =
        String(
            req.body.deviceName ||
            "Perangkat VEIL"
        ).trim();


    if (!/^\d{6}$/.test(code)) {

        return res.status(400).json({

            success: false,

            message:
                "Kode pairing tidak valid."

        });

    }


    if (!deviceId) {

        return res.status(400).json({

            success: false,

            message:
                "Identitas perangkat tidak ditemukan."

        });

    }


    const pairing =
        pairingStore.get(code);


    if (!pairing) {

        return res.status(404).json({

            success: false,

            message:
                "Kode pairing tidak ditemukan atau sudah digunakan."

        });

    }


    // Kode sudah digunakan

    if (pairing.used === true) {

        return res.status(409).json({

            success: false,

            message:
                "Kode pairing sudah digunakan."

        });

    }


    // Cek expired

    if (
        Date.now() >
        pairing.expiresAt
    ) {

        pairingStore.delete(code);

        return res.status(410).json({

            success: false,

            message:
                "Kode pairing sudah kedaluwarsa."

        });

    }


    const account =
        accounts.get(
            pairing.email
        );


    if (!account) {

        pairingStore.delete(code);

        return res.status(404).json({

            success: false,

            message:
                "Akun tidak ditemukan."

        });

    }


    // Cek email terverifikasi

    if (!account.emailVerified) {

        return res.status(403).json({

            success: false,

            message:
                "Email akun belum diverifikasi."

        });

    }


    // Cek maksimal 5 perangkat

    if (
        account.devices.size >=
        MAX_DEVICES
    ) {

        return res.status(409).json({

            success: false,

            message:
                "Batas maksimal 5 perangkat sudah tercapai."

        });

    }


    // Cegah device yang sama
    // didaftarkan dua kali

    if (
        account.devices.has(deviceId)
    ) {

        pairing.used = true;

        pairing.deviceId =
            deviceId;

        pairing.deviceName =
            deviceName;

        pairing.pairedAt =
            Date.now();

        pairingStore.set(
            code,
            pairing
        );


        return res.json({

            success: true,

            message:
                "Perangkat sudah terdaftar.",

            deviceId:
                deviceId,

            deviceName:
                deviceName

        });

    }


    // Daftarkan perangkat

    account.devices.set(
        deviceId,
        {

            deviceId:
                deviceId,

            deviceName:
                deviceName,

            connectedAt:
                Date.now(),

            status:
                "connected"

        }
    );


    // Tandai kode sudah digunakan
    // tetapi JANGAN langsung dihapus.
    // Dashboard masih perlu membaca statusnya.

    pairing.used = true;

    pairing.deviceId =
        deviceId;

    pairing.deviceName =
        deviceName;

    pairing.pairedAt =
        Date.now();


    pairingStore.set(
        code,
        pairing
    );


    console.log(
        "Perangkat berhasil dipairing:",
        deviceName,
        "|",
        deviceId,
        "|",
        pairing.email
    );


    return res.json({

        success: true,

        message:
            "Perangkat berhasil dipairing.",
         
        email: 
            pairing.email,

        deviceId:
            deviceId,

        deviceName:
            deviceName

    });

});


// =====================================================
// DAFTAR PERANGKAT
// =====================================================

app.post("/api/devices", (req, res) => {

    const email =
        normalizeEmail(
            req.body.email
        );


    const account =
        accounts.get(email);


    if (!account) {

        return res.status(404).json({

            success: false,

            message:
                "Akun tidak ditemukan."

        });

    }


    const devices =
        Array.from(
            account.devices.values()
        );


    return res.json({

        success: true,

        email: email,

        maxDevices:
            MAX_DEVICES,

        deviceCount:
            devices.length,

        devices:
            devices

    });

});


// =====================================================
// STATUS PERANGKAT
// =====================================================

app.post("/api/device-status", (req, res) => {

    const email =
        normalizeEmail(
            req.body.email
        );


    const account =
        accounts.get(email);


    if (!account) {

        return res.status(404).json({

            success: false,

            message:
                "Akun tidak ditemukan."

        });

    }


    return res.json({

        success: true,

        connectedDevices:
            account.devices.size,

        maxDevices:
            MAX_DEVICES,

        devices:
            Array.from(
                account.devices.values()
            )

    });

});

// =====================================================
// UPDATE LOKASI PERANGKAT
// =====================================================

app.post("/api/update-location", (req, res) => {

    const email =
        normalizeEmail(req.body.email);

    const deviceId =
        String(
            req.body.deviceId || ""
        ).trim();

    const latitude =
        Number(req.body.latitude);

    const longitude =
        Number(req.body.longitude);

    const accuracy =
        Number(req.body.accuracy);


    // ================================================
    // VALIDASI
    // ================================================

    if (!email) {

        return res.status(400).json({

            success: false,

            message:
                "Email diperlukan."

        });

    }


    if (!deviceId) {

        return res.status(400).json({

            success: false,

            message:
                "Device ID diperlukan."

        });

    }


    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {

        return res.status(400).json({

            success: false,

            message:
                "Koordinat lokasi tidak valid."

        });

    }


    const account =
        accounts.get(email);


    if (!account) {

        return res.status(404).json({

            success: false,

            message:
                "Akun tidak ditemukan."

        });

    }


    const device =
        account.devices.get(deviceId);


    if (!device) {

        return res.status(404).json({

            success: false,

            message:
                "Perangkat tidak ditemukan."

        });

    }


    // ================================================
    // SIMPAN LOKASI
    // ================================================

    device.location = {

        latitude:
            latitude,

        longitude:
            longitude,

        accuracy:
            Number.isFinite(accuracy)
                ? accuracy
                : null,

        updatedAt:
            Date.now()

    };


    device.lastSeen =
        Date.now();


    device.status =
        "connected";


    device.locationRequest =
    null;
        
    console.log(
        "Lokasi diperbarui:",
        device.deviceName,
        "|",
        latitude,
        longitude
    );


    return res.json({

        success: true,

        message:
            "Lokasi berhasil diperbarui.",

        location:
            device.location

    });

});

// =====================================================
// REQUEST LOKASI TERKINI
// =====================================================

app.post("/api/request-location", (req, res) => {

    const email =
        normalizeEmail(req.body.email);

    const deviceId =
        String(
            req.body.deviceId || ""
        ).trim();


    if (!email) {

        return res.status(400).json({

            success: false,

            message:
                "Email diperlukan."

        });

    }


    if (!deviceId) {

        return res.status(400).json({

            success: false,

            message:
                "Device ID diperlukan."

        });

    }


    const account =
        accounts.get(email);


    if (!account) {

        return res.status(404).json({

            success: false,

            message:
                "Akun tidak ditemukan."

        });

    }


    const device =
        account.devices.get(deviceId);


    if (!device) {

        return res.status(404).json({

            success: false,

            message:
                "Perangkat tidak ditemukan."

        });

    }


    // Buat ID request unik

    const requestId =
        crypto.randomUUID();


    device.locationRequest = {

        requestId:
            requestId,

        requestedAt:
            Date.now()

    };


    console.log(
        "Request lokasi:",
        device.deviceName,
        "|",
        requestId
    );


    return res.json({

        success: true,

        requestId:
            requestId,

        message:
            "Permintaan lokasi dikirim."

    });

});


// =====================================================
// CEK REQUEST LOKASI OLEH PERANGKAT
// =====================================================

app.post("/api/location-request", (req, res) => {

    const email =
        normalizeEmail(req.body.email);

    const deviceId =
        String(
            req.body.deviceId || ""
        ).trim();


    if (!email || !deviceId) {

        return res.status(400).json({

            success: false,

            message:
                "Email dan Device ID diperlukan."

        });

    }


    const account =
        accounts.get(email);


    if (!account) {

        return res.status(404).json({

            success: false,

            message:
                "Akun tidak ditemukan."

        });

    }


    const device =
        account.devices.get(deviceId);


    if (!device) {

        return res.status(404).json({

            success: false,

            message:
                "Perangkat tidak ditemukan."

        });

    }


    return res.json({

        success: true,

        request:
            device.locationRequest || null

    });

});


// =====================================================
// AMBIL LOKASI PERANGKAT
// =====================================================

app.post("/api/device-location", (req, res) => {

    const email =
        normalizeEmail(req.body.email);

    const deviceId =
        String(
            req.body.deviceId || ""
        ).trim();


    if (!email) {

        return res.status(400).json({

            success: false,

            message:
                "Email diperlukan."

        });

    }


    if (!deviceId) {

        return res.status(400).json({

            success: false,

            message:
                "Device ID diperlukan."

        });

    }


    const account =
        accounts.get(email);


    if (!account) {

        return res.status(404).json({

            success: false,

            message:
                "Akun tidak ditemukan."

        });

    }


    const device =
        account.devices.get(deviceId);


    if (!device) {

        return res.status(404).json({

            success: false,

            message:
                "Perangkat tidak ditemukan."

        });

    }


    if (!device.location) {

        return res.json({

            success: true,

            location: null,

            message:
                "Lokasi perangkat belum tersedia."

        });

    }


    return res.json({

        success: true,

        location:
            device.location

    });

});

// =====================================================
// HAPUS PERANGKAT
// =====================================================

app.post("/api/remove-device", (req, res) => {

    const email =
        normalizeEmail(
            req.body.email
        );


    const deviceId =
        String(
            req.body.deviceId || ""
        ).trim();


    const account =
        accounts.get(email);


    if (!account) {

        return res.status(404).json({

            success: false,

            message:
                "Akun tidak ditemukan."

        });

    }


    if (
        !account.devices.has(deviceId)
    ) {

        return res.status(404).json({

            success: false,

            message:
                "Perangkat tidak ditemukan."

        });

    }


    account.devices.delete(
        deviceId
    );


    return res.json({

        success: true,

        message:
            "Perangkat berhasil dihapus."

    });

});


// =====================================================
// SERVER
// =====================================================

app.listen(PORT, () => {
  console.log(`VEIL server berjalan di port ${PORT}`);
});
