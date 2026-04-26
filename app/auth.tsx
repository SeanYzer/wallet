import React, { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, Card, HelperText, useTheme as usePaperTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { addUser, saveUserProfile } from '../utils/db';
import * as Crypto from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';

import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AuthScreen() {
    const router = useRouter();
    const { login } = useAuth();

    // UI state
    const [name, setName] = useState(""); // This is now used for email
    const [passcode, setPasscode] = useState("");
    const [loading, setLoading] = useState(false);
    const [emailError, setEmailError] = useState("");
    const [pinError, setPinError] = useState("");

    const API_URL = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_LOCAL_URL;

    const checkConnection = async () => {
        // Platform agnostic check for known offline state
        if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

        try {
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 3000)
            );
            const response = await Promise.race([
                fetch(`${API_URL}/paymentMethods`),
                timeout
            ]) as Response;
            return response.ok;
        } catch (e) {
            return false;
        }
    };

    const showAlert = (title: string, message: string, buttons?: any[]) => {
        if (Platform.OS === 'web') {
            if (buttons && buttons.length > 0) {
                const confirmMsg = confirm(`${title}\n\n${message}`);
                if (confirmMsg) {
                    buttons[0].onPress();
                } else if (buttons.length > 1) {
                    buttons[1].onPress();
                }
            } else {
                alert(`${title}: ${message}`);
            }
        } else {
            Alert.alert(title, message, buttons);
        }
    };

    const handleRegister = async () => {
        setEmailError("");
        setPinError("");

        if (!name.trim()) {
            setEmailError("Email is required");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(name.trim())) {
            setEmailError("Please enter a valid email address.");
            return;
        }

        if (!passcode.trim()) {
            setPinError("PIN is required");
            return;
        }

        setLoading(true);

        try {
            // ALWAYS try Online first
            const response = await fetch(`${API_URL}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), passcode: passcode.trim(), initialBalance: 0 }),
            });

            const responseData = await response.json();

            if (response.ok) {
                await addUser(responseData.data.user.id, name.trim(), passcode.trim());
                await saveUserProfile(name.trim(), true, 0, responseData.data.user.id);
                await login(responseData.data.user.id, responseData.data.token);
                setLoading(false);
                return;
            } else {
                // Definitive cloud error (e.g. Email Taken)
                showAlert("Registration Error", responseData.message || "Email is not available.");
                setLoading(false);
                return;
            }
        } catch (e: any) {
            // Reachability error (Timeout / No Internet)
            console.log("Could not reach cloud:", e.message);

            const { generateUUID } = require('../utils/uuid');
            const offlineId = generateUUID();

            showAlert(
                "Cloud Unreachable",
                "We couldn't connect to our servers to verify your account. Would you like to create a local-only account for now? NOTE: Uniqueness cannot be checked while offline.",
                [
                    {
                        text: "Proceed Offline",
                        onPress: async () => {
                            try {
                                await addUser(offlineId, name.trim(), passcode.trim());
                                await saveUserProfile(name.trim(), true, 0, offlineId);
                                await login(offlineId, "offline_token");
                            } catch (err) {
                                showAlert("Error", "Failed to create local account.");
                            } finally {
                                setLoading(false);
                            }
                        }
                    },
                    { text: "Try Again", style: "cancel", onPress: () => setLoading(false) }
                ]
            );
        }
    };

    const handleLogin = async () => {
        setEmailError("");
        setPinError("");

        if (!name.trim()) {
            setEmailError("Email is required");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(name.trim())) {
            setEmailError("Please enter a valid email address.");
            return;
        }

        if (!passcode.trim()) {
            setPinError("PIN is required");
            return;
        }

        setLoading(true);
        const isOnline = await checkConnection();

        if (isOnline) {
            try {
                const response = await fetch(`${API_URL}/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name.trim(), passcode: passcode.trim() }),
                });

                const responseData = await response.json();

                if (!response.ok) {
                    showAlert("Authentication Error", responseData.message || "Invalid credentials");
                    setLoading(false);
                    return;
                }

                await addUser(responseData.data.user.id, name.trim(), passcode.trim());
                await saveUserProfile(name.trim(), false, 0, responseData.data.user.id);
                await login(responseData.data.user.id, responseData.data.token);
            } catch (e: any) {
                console.error("Online login failed:", e);
                // Attempt local login if cloud fails due to network
                await attemptLocalLogin();
            } finally {
                setLoading(false);
            }
        } else {
            await attemptLocalLogin();
            setLoading(false);
        }
    };

    const attemptLocalLogin = async () => {
        const { getUsers } = require('../utils/db');
        const users = await getUsers();
        const localUser = users.find((u: any) => u.name === name.trim());

        if (localUser) {
            // Local passcode is stored as SHA-256 hash or plain text (legacy)
            try {
                const hashedInput = await Crypto.digestStringAsync(
                    Crypto.CryptoDigestAlgorithm.SHA256,
                    passcode.trim()
                );

                if (localUser.passcode === hashedInput || localUser.passcode === passcode.trim()) {
                    await login(localUser.id, "local_token");
                } else {
                    showAlert("Error", "Invalid PIN");
                }
            } catch (err) {
                showAlert("Error", "Authentication failed. Error: " + (err as Error).message);
            }
        } else {
            showAlert("Login Failed", "No local data found for this email. Please go online to sync your cloud account for the first time.");
        }
    };

    return (
        <LinearGradient colors={["#1a237e", "#283593", "#3949ab"]} style={styles.gradient}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                    <View style={styles.container}>
                        <Text style={styles.appName}>WiseWallet</Text>
                        <Text style={styles.tagline}>Welcome Back</Text>

                        <Card style={styles.card}>
                            <Card.Content>
                                <TextInput
                                    label="Email"
                                    value={name}
                                    onChangeText={(text) => { setName(text); setEmailError(""); }}
                                    style={styles.input}
                                    mode="outlined"
                                    outlineColor="#e0e0e0"
                                    activeOutlineColor="#3949ab"
                                    error={!!emailError}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                                <HelperText type="error" visible={!!emailError}>
                                    {emailError}
                                </HelperText>

                                <TextInput
                                    label="PIN (4-digits)"
                                    value={passcode}
                                    onChangeText={(text) => { setPasscode(text); setPinError(""); }}
                                    keyboardType="numeric"
                                    secureTextEntry
                                    style={styles.input}
                                    mode="outlined"
                                    outlineColor="#e0e0e0"
                                    activeOutlineColor="#3949ab"
                                    error={!!pinError}
                                />
                                <HelperText type="error" visible={!!pinError}>
                                    {pinError}
                                </HelperText>

                                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                                    <Button
                                        mode="contained"
                                        onPress={handleLogin}
                                        loading={loading}
                                        disabled={loading}
                                        style={[styles.createBtn, { flex: 1, marginTop: 0 }]}
                                    >
                                        Login
                                    </Button>
                                    <Button
                                        mode="outlined"
                                        onPress={handleRegister}
                                        loading={loading}
                                        disabled={loading}
                                        style={[styles.createBtn, { flex: 1, marginTop: 0, backgroundColor: 'transparent', borderColor: '#3949ab' }]}
                                        textColor="#3949ab"
                                    >
                                        Register
                                    </Button>
                                </View>
                            </Card.Content>
                        </Card>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    gradient: { flex: 1 },
    scrollContainer: { flexGrow: 1, justifyContent: 'center' },
    container: { padding: 24 },
    appName: { fontSize: 36, fontWeight: "bold", color: "#fff", textAlign: 'center', marginBottom: 8 },
    tagline: { fontSize: 16, color: "rgba(255,255,255,0.7)", textAlign: 'center', marginBottom: 32 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 8,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8
    },
    createBtn: { marginTop: 20, marginBottom: 8, borderRadius: 12, paddingVertical: 4, backgroundColor: '#3949ab' },
    input: { marginBottom: 4, backgroundColor: '#fff' }
});
