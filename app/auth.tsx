import React, { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, Card, useTheme as usePaperTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { addUser, saveUserProfile } from '../utils/db';
import { LinearGradient } from 'expo-linear-gradient';

export default function AuthScreen() {
    const router = useRouter();
    const { login } = useAuth();

    // UI state
    const [name, setName] = useState(""); // This is now used for email
    const [passcode, setPasscode] = useState("");
    const [loading, setLoading] = useState(false);

    const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

    const checkConnection = async () => {
        try {
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 3000)
            );
            const response = await Promise.race([
                fetch(`${API_URL}/api/paymentMethods`), // Lightweight ping
                timeout
            ]) as Response;
            return response.ok;
        } catch (e) {
            return false;
        }
    };

    const handleRegister = async () => {
        if (!name.trim() || !passcode.trim()) {
            Alert.alert("Error", "Email and PIN are required");
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(name.trim())) {
            Alert.alert("Invalid Email", "Please enter a valid email address.");
            return;
        }

        setLoading(true);
        const isOnline = await checkConnection();

        if (isOnline) {
            try {
                const response = await fetch(`${API_URL}/api/auth/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name.trim(), passcode: passcode.trim(), initialBalance: 0 }),
                });

                const responseData = await response.json();

                if (!response.ok) {
                    Alert.alert("Error", responseData.message || "Could not register account");
                    setLoading(false);
                    return;
                }

                await addUser(responseData.data.user.id, name.trim(), passcode.trim());
                await saveUserProfile(name.trim(), true, 0, responseData.data.user.id);
                await login(responseData.data.user.id, responseData.data.token);
            } catch (e: any) {
                console.error("Online registration failed:", e);
                Alert.alert("Error", "Cloud registration failed. Please try again or check your connection.");
            } finally {
                setLoading(false);
            }
        } else {
            // Offline Registration
            const { generateUUID } = require('../utils/uuid');
            const offlineId = generateUUID();
            
            Alert.alert(
                "Offline Account",
                "You are currently offline. We will create a local account for you. You can sync this to the cloud later by turning on Auto-save in Settings.",
                [
                    {
                        text: "Proceed",
                        onPress: async () => {
                            try {
                                await addUser(offlineId, name.trim(), passcode.trim());
                                await saveUserProfile(name.trim(), true, 0, offlineId);
                                await login(offlineId, "offline_token");
                            } catch (err) {
                                Alert.alert("Error", "Failed to create local account.");
                            } finally {
                                setLoading(false);
                            }
                        }
                    },
                    { text: "Cancel", style: "cancel", onPress: () => setLoading(false) }
                ]
            );
        }
    };

    const handleLogin = async () => {
        if (!name.trim() || !passcode.trim()) {
            Alert.alert("Error", "Email and PIN are required");
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(name.trim())) {
            Alert.alert("Invalid Email", "Please enter a valid email address.");
            return;
        }

        setLoading(true);
        const isOnline = await checkConnection();

        if (isOnline) {
            try {
                const response = await fetch(`${API_URL}/api/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name.trim(), passcode: passcode.trim() }),
                });

                const responseData = await response.json();

                if (!response.ok) {
                    Alert.alert("Error", responseData.message || "Invalid credentials");
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
            const bcrypt = require('bcryptjs');
            // If it's a local-only user, passcode might be plain or hashed.
            // But addUser hashes it in recent versions.
            try {
                const isMatch = await bcrypt.compare(passcode.trim(), localUser.passcode);
                if (isMatch) {
                    await login(localUser.id, "local_token");
                } else {
                    Alert.alert("Error", "Invalid local PIN");
                }
            } catch (err) {
                // Fallback for plain text legacy local users
                if (localUser.passcode === passcode.trim()) {
                    await login(localUser.id, "local_token");
                } else {
                    Alert.alert("Error", "Invalid PIN");
                }
            }
        } else {
            Alert.alert("Login Failed", "No local data found for this email. Please go online to sync your cloud account for the first time.");
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
                                    onChangeText={setName}
                                    style={styles.input}
                                    mode="outlined"
                                    outlineColor="#e0e0e0"
                                    activeOutlineColor="#3949ab"
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                                <TextInput
                                    label="PIN (4-digits)"
                                    value={passcode}
                                    onChangeText={setPasscode}
                                    keyboardType="numeric"
                                    secureTextEntry
                                    style={styles.input}
                                    mode="outlined"
                                    outlineColor="#e0e0e0"
                                    activeOutlineColor="#3949ab"
                                />

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
    input: { marginBottom: 12, backgroundColor: '#fff' }
});
