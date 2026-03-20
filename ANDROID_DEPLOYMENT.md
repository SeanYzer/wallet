# Mobile Setup & Troubleshooting Guide

This guide covers everything you need to run, troubleshoot, and deploy the WiseWallet app on a mobile device.

---

## 🚀 1. Quick Start: Running on your Phone
The fastest way to test your app is using **Expo Go**.

1. **Install Expo Go:** Download the app from the Google Play Store (Android) or App Store (iOS).
2. **Connect to Wi-Fi:** Ensure your phone and laptop are on the **same Wi-Fi network**.
3. **Start the Server:** Run `npm run start` or `npx expo start -c` in your terminal.
4. **Scan QR Code:** Open Expo Go, tap **"Scan QR Code"**, and scan the code in your terminal.
5. **Start API:** Make sure your mock server is running in a separate terminal: `npm run server`.

---

## 🛠️ 2. Common Errors & Fixes

### ❌ Error: "Failed to resolve Android SDK path" / "adb not recognized"
*   **Cause:** You pressed the `a` key in the terminal, but you don't have Android Studio (SDK) installed.
*   **Fix:** **Ignore this error.** You do NOT need the Android SDK to run on a physical phone. Just use the QR code as described in Section 1.

### ❌ Error: "TypeError: getDevServer is not a function"
*   **Cause:** Your local cache is corrupted or dependencies are out of sync.
*   **Fix:** Stop the server and run:
    ```bash
    npx expo install --fix
    npx expo start -c
    ```

### ❌ Error: "Network request failed" (API connection)
*   **Cause A: Windows Firewall.** Your network profile is likely set to "Public," which blocks your phone from talking to your laptop.
    *   **Fix:** Go to Windows Settings > Network > Wi-Fi > [Your Network] and change the profile to **Private**.
*   **Cause B: Hardcoded Localhost.** Your app is trying to find the API at `localhost`, which means the phone is looking at itself.
    *   **Fix:** We have already fixed this using the **Environment Variables** setup below.

---

## ⚙️ 3. Configuration (.env)
To make the API work across different computers and Wi-Fi networks, we use a `.env` file.

1.  **Locate `.env`:** Open the `.env` file in the root directory.
2.  **Update IP:** Ensure `EXPO_PUBLIC_API_URL` matches your computer's current Wi-Fi IP address:
    ```env
    EXPO_PUBLIC_API_URL=http://192.168.5.101:3000
    ```
3.  **Automatic:** The app's code now automatically reads this variable. If you switch to a new Wi-Fi, just update this one line in `.env` and restart the server.

---

## 🌐 4. Using a Real Backend (.NET Core + ngrok)
If you move from `json-server` to a real **.NET Core API**, you can use **ngrok** to make it accessible to your phone even if you aren't on the same Wi-Fi.

1.  **Start your .NET API:** Run your API locally (e.g., `dotnet run`). Note the port it uses (usually `5000` or `5001`).
2.  **Start ngrok:** In a new terminal, run:
    ```bash
    ngrok http 5000
    ```
3.  **Get the URL:** ngrok will provide a public forwarding URL like `https://a1b2-c3d4.ngrok-free.app`.
4.  **Update `.env`:** Copy that ngrok URL and paste it into your `.env` file:
    ```env
    EXPO_PUBLIC_API_URL=https://a1b2-c3d4.ngrok-free.app
    ```
5.  **Restart Expo:** Restart your Expo server (`npx expo start -c`) so it picks up the new URL.

**Why use ngrok?**
*   **Bypasses Firewalls:** You don't need to change your network to "Private."
*   **Cellular Data:** Your phone can connect to the API even if it's using 4G/5G instead of Wi-Fi.
*   **HTTPS:** It provides a secure connection automatically.

### 🛡️ 4.1 Security & Networking (ngrok)
*   **HTTPS vs. HTTP:** Mobile OSs (Android/iOS) generally block non-secure `http` requests by default (Cleartext Traffic). ngrok is great because it provides a **secure `https` tunnel** for you, even if your local .NET API is only running on `http`.
*   **Firewall:** ngrok works by creating an *outbound* connection from your computer to their servers. This means it **punches through your Windows Firewall** and your Wi-Fi router's firewall automatically. You don't need to change any network settings or open ports on your router.
*   **Public Access:** Once ngrok is running, **anyone with the URL** can access your local database. For development, this is fine, but never leave it running unattended with sensitive data!

---

## 🏗️ 5. Backend Alternatives (Node.js vs. Supabase)
If you decide to move away from `json-server`, you have several paths:

### Path A: Node.js (Express)
*   **How it works:** You write your API in Javascript/Typescript using the `Express` framework.
*   **Pros:** Same language as your React Native app. Very fast to build and lightweight.
*   **Setup:** You still run this locally and use **ngrok** to connect your phone during development.

### Path B: Supabase (Recommended for Apps)
*   **How it works:** Supabase is "Backend-as-a-Service." They provide a PostgreSQL database and an API out-of-the-box.
*   **Pros:**
    1.  **No ngrok needed:** It's already in the cloud!
    2.  **Built-in Auth:** Handle user login (Google, Email, etc.) instantly.
    3.  **Realtime:** Your app can "listen" for changes and update the UI instantly.
*   **Setup:** You just replace the `API_URL` in your `.env` with your Supabase Project URL. Its HTTPS from the start.

### Path C: .NET Core API (Production Ready)
*   **How it works:** A professional, robust backend using C#.
*   **Pros:** Industry standard for large, complex enterprise applications.
*   **Setup:** During development, use **ngrok** to map your `localhost:5001` (https) or `localhost:5000` (http) to a public URL.

---

## 📦 6. Deployment Methods

### Method A: Shareable APK (Preview)
To create a permanent app file (`.apk`) you can send to others:
1. Install EAS CLI: `npm install -g eas-cli`
2. Run: `eas build -p android --profile preview`
3. Download the result from the link provided in the terminal.

### Method B: Production (Google Play Store)
To prepare for a real release:
1. Run: `eas build -p android`
2. This generates an `.aab` file which you upload to the Google Play Console.
