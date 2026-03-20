# Android Deployment Guide for Wise Wallet

This guide outlines the different methods to deploy and run this React Native (Expo) application on an Android device.

## Prerequisites
- Ensure you have `node` and `npm` installed.
- Ensure you have run `npm install` in the project directory.

---

## Method 1: Development via Expo Go (Wireless)
This is the fastest way to run your app on a physical Android device during development.

1. **Install Expo Go:** Download the **Expo Go** app from the Google Play Store on your Android device.
2. **Network Connection:** Connect both your computer and your Android device to the **same Wi-Fi network**.
3. **Start the Server:** Run the following command in your terminal:
   ```bash
   npm run start
   ```
4. **Scan QR Code:** Open the Expo Go app on your phone, tap **"Scan QR Code"**, and scan the QR code displayed in your terminal.
5. **Hot Reloading:** The app will load. Any changes you save in the code will automatically refresh on your phone.

---

## Method 2: Development via USB Debugging (Wired)
Use this if Wi-Fi is unstable or restricted.

1. **Enable USB Debugging:** 
   - On Android: Go to *Settings > About Phone* and tap **Build Number** 7 times.
   - Go to *Settings > System > Developer Options* and enable **USB Debugging**.
2. **Connect Device:** Plug your Android phone into your computer via USB.
3. **Run Command:**
   ```bash
   npm run android
   ```
4. Expo will detect the connected device and launch the app via Expo Go.

---

## Method 3: Build a Standalone APK (Sharing/Testing)
To create an installable `.apk` file that doesn't require a development server.

1. **Install EAS CLI:**
   ```bash
   npm install -g eas-cli
   ```
2. **Setup EAS:**
   ```bash
   eas login
   eas build:configure
   ```
3. **Configure APK Build:** Ensure your `eas.json` has a profile with `buildType: "apk"`.
   Example `eas.json` snippet:
   ```json
   {
     "build": {
       "preview": {
         "android": { "buildType": "apk" }
       }
     }
   }
   ```
4. **Generate APK:**
   ```bash
   eas build -p android --profile preview
   ```
5. **Install:** Once complete, download the `.apk` from the provided Expo link and install it on your device.

---

## Method 4: Production Build (Google Play Store)
To prepare the app for official release.

1. **Run Production Build:**
   ```bash
   eas build -p android
   ```
2. **Download AAB:** This will generate an `.aab` (Android App Bundle) file.
3. **Publish:** Upload the `.aab` file to your **Google Play Console** account.
