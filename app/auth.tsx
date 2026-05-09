import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, Card, HelperText, RadioButton, SegmentedButtons } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../context/UserProfileContext';
import { addUser, saveUserProfile, API_URL, initDb } from '../utils/db';
import * as Crypto from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';

import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AuthScreen() {
    const router = useRouter();
    const { login, token } = useAuth();
    const { profile } = useUserProfile();

    useFocusEffect(
        useCallback(() => {
            if (token === 'offline_token' && profile?.name) {
                setName(profile.name);
            }
        }, [token, profile])
    );

    const [name, setName] = useState("");
    const [passcode, setPasscode] = useState("");
    const [loading, setLoading] = useState(false);
    const [nameError, setNameError] = useState("");
    const [pinError, setPinError] = useState("");
    const [accountMode, setAccountMode] = useState<'cloud' | 'offline'>('cloud');

    const getDeviceId = async () => {
        let deviceId = await AsyncStorage.getItem('localDeviceId');
        if (!deviceId) {
            const { generateUUID } = require('../utils/uuid');
            deviceId = generateUUID();
            await AsyncStorage.setItem('localDeviceId', deviceId);
        }
        return deviceId;
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

    const createLocalAccount = async (username: string, pin: string) => {
        const { generateUUID } = require('../utils/uuid');
        const offlineId = generateUUID();
        const { setSetting, getUsers } = require('../utils/db');
        
        const users = await getUsers();
        const localDuplicate = users.find((u: any) => u.name.toLowerCase() === username.toLowerCase());

        if (localDuplicate) {
            showAlert("Username Taken", "This username is already registered on this device. Please use a different username or login instead.");
            return false;
        }

        await addUser(offlineId, username, pin);
        await saveUserProfile(username, true, 0, offlineId);
        await initDb(offlineId);
        await setSetting('autoBackup', 'false');
        await login(offlineId, "offline_token");
        return true;
    };

    const handleRegister = async () => {
        setNameError("");
        setPinError("");

        if (!name.trim()) {
            setNameError(accountMode === 'cloud' ? "Email is required" : "Username is required");
            return;
        }

        if (accountMode === 'cloud') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(name.trim())) {
                setNameError("Please enter a valid email address.");
                return;
            }
        }

        if (!passcode.trim()) {
            setPinError("PIN is required");
            return;
        }

        setLoading(true);

        if (accountMode === 'offline') {
            console.log("Creating offline-only account");
            try {
                const success = await createLocalAccount(name.trim(), passcode.trim());
                if (!success) {
                    setLoading(false);
                    return;
                }
            } catch (err) {
                showAlert("Error", "Failed to create local account.");
            } finally {
                setLoading(false);
            }
            return;
        }

        if (!API_URL) {
            console.log("No API_URL configured, registering locally");
            try {
                const success = await createLocalAccount(name.trim(), passcode.trim());
                if (!success) {
                    setLoading(false);
                    return;
                }
            } catch (err) {
                showAlert("Error", "Failed to create local account.");
            } finally {
                setLoading(false);
            }
            return;
        }

        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), passcode: passcode.trim(), initialBalance: 0 }),
            });

            const responseData = await response.json();

            if (response.ok) {
                const { setSetting } = require('../utils/db');
                await addUser(responseData.data.user.id, name.trim(), passcode.trim());
                await saveUserProfile(name.trim(), true, 0, responseData.data.user.id);
                await initDb(responseData.data.user.id);
                await setSetting('autoBackup', 'true');
                await login(responseData.data.user.id, responseData.data.token);
                setLoading(false);
                return;
            } else {
                showAlert("Registration Error", responseData.message || "Email is not available.");
                setLoading(false);
                return;
            }
        } catch (e: any) {
            console.log("Could not reach cloud:", e.message);

            const { generateUUID } = require('../utils/uuid');
            const offlineId = generateUUID();

            showAlert(
                "Cloud Unreachable",
                "We couldn't connect to our servers to verify your account. Would you like to create a local-only account for now?",
                [
                    {
                        text: "Proceed Offline",
                        onPress: async () => {
                            try {
                                const { setSetting } = require('../utils/db');
                                await addUser(offlineId, name.trim(), passcode.trim());
                                await saveUserProfile(name.trim(), true, 0, offlineId);
                                await initDb(offlineId);
                                await setSetting('autoBackup', 'false');
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

    const handleLogin = async (force = false) => {
        setNameError("");
        setPinError("");

        if (!name.trim()) {
            setNameError("Email or username is required");
            return;
        }

        if (!passcode.trim()) {
            setPinError("PIN is required");
            return;
        }

        setLoading(true);
        const deviceId = await getDeviceId();

        if (!API_URL) {
            console.log("No API_URL configured, using local-only login");
            await attemptLocalLogin();
            setLoading(false);
            return;
        }

        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), passcode: passcode.trim(), deviceId, force }),
            });

            const responseData = await response.json();

            if (response.ok) {
                const data = responseData.data;

                if (data.sessionConflict) {
                    setLoading(false);
                    showAlert(
                        "Session Active",
                        "This account is already logged in on another device. Logging in here will log you out of the other device. Proceed?",
                        [
                            { text: "Yes, Log In", onPress: () => handleLogin(true) },
                            { text: "No", style: "cancel" }
                        ]
                    );
                    return;
                }

                await addUser(data.user.id, name.trim(), passcode.trim());
                await saveUserProfile(name.trim(), false, 0, data.user.id);
                await login(data.user.id, data.token);
            } else {
                console.log("Cloud login failed, trying local fallback...");
                await attemptLocalLogin();
            }
        } catch (e: any) {
            console.error("Online login failed, attempting local fallback:", e);
            await attemptLocalLogin();
        } finally {
            setLoading(false);
        }
    };

    const attemptLocalLogin = async () => {
        const { getUsers } = require('../utils/db');
        const users = await getUsers();
        const localUser = users.find((u: any) => u.name.toLowerCase() === name.trim().toLowerCase());

        if (localUser) {
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
            showAlert(
                "Login Failed",
                "No local data found for this email/username. Please go online to sync your cloud account for the first time, or register a new account.",
                [
                    { text: "OK", style: "cancel" }
                ]
            );
        }
    };

    const inputLabel = accountMode === 'cloud' ? 'Email' : 'Username';
    const inputPlaceholder = accountMode === 'cloud' ? 'email@example.com' : 'Enter a username';
    const inputKeyboardType = accountMode === 'cloud' ? 'email-address' : 'default';

    return (
        <LinearGradient colors={["#1a237e", "#283593", "#3949ab"]} style={styles.gradient}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                    <View style={styles.container}>
                        <Text style={styles.appName}>WiseWallet</Text>
                        <Text style={styles.tagline}>{token === 'offline_token' ? 'Link Your Account' : 'Welcome Back'}</Text>
                        {token === 'offline_token' && (
                            <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 12, opacity: 0.8 }}>
                                Register your local account to the cloud to enable sync.
                            </Text>
                        )}

                        <Card style={styles.card}>
                            <Card.Content>
                                <View style={styles.modeSelector}>
                                    <SegmentedButtons
                                        value={accountMode}
                                        onValueChange={(value) => {
                                            setAccountMode(value as 'cloud' | 'offline');
                                            setNameError("");
                                            setName("");
                                        }}
                                        buttons={[
                                            {
                                                value: 'cloud',
                                                label: 'Cloud Account',
                                                icon: 'cloud'
                                            },
                                            {
                                                value: 'offline',
                                                label: 'Offline Only',
                                                icon: 'cloud-off'
                                            }
                                        ]}
                                        style={styles.segmentedButtons}
                                    />
                                </View>

                                <TextInput
                                    label={inputLabel}
                                    value={name}
                                    onChangeText={(text) => { setName(text); setNameError(""); }}
                                    style={styles.input}
                                    textColor="#1a237e"
                                    mode="outlined"
                                    outlineColor="#e0e0e0"
                                    activeOutlineColor="#3949ab"
                                    error={!!nameError}
                                    autoCapitalize="none"
                                    keyboardType={inputKeyboardType}
                                    placeholder={inputPlaceholder}
                                />
                                <HelperText type="error" visible={!!nameError}>
                                    {nameError}
                                </HelperText>

                                <TextInput
                                    label="PIN (4-digits)"
                                    value={passcode}
                                    onChangeText={(text) => { setPasscode(text); setPinError(""); }}
                                    keyboardType="numeric"
                                    secureTextEntry
                                    style={styles.input}
                                    textColor="#1a237e"
                                    mode="outlined"
                                    outlineColor="#e0e0e0"
                                    activeOutlineColor="#3949ab"
                                    error={!!pinError}
                                />
                                <HelperText type="error" visible={!!pinError}>
                                    {pinError}
                                </HelperText>

                                {accountMode === 'offline' && (
                                    <View style={styles.offlineNotice}>
                                        <Text variant="bodySmall" style={{ color: '#666', textAlign: 'center' }}>
                                            Offline-only accounts:
                                        </Text>
                                        <Text variant="bodySmall" style={{ color: '#888', textAlign: 'center', marginTop: 4 }}>
                                            • No cloud sync
                                        </Text>
                                        <Text variant="bodySmall" style={{ color: '#888', textAlign: 'center' }}>
                                            • Device-bound only
                                        </Text>
                                        <Text variant="bodySmall" style={{ color: '#888', textAlign: 'center' }}>
                                            • Can link to cloud later
                                        </Text>
                                    </View>
                                )}

                                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                                    <Button
                                        mode="contained"
                                        onPress={() => handleLogin(false)}
                                        loading={loading}
                                        disabled={loading}
                                        style={[styles.createBtn, { flex: 1, marginTop: 0 }]}
                                    >
                                        Login
                                    </Button>
                                    <Button
                                        mode="outlined"
                                        onPress={() => handleRegister()}
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
    appName: {
        fontSize: 42,
        fontWeight: "bold",
        color: "#fff",
        textAlign: 'center',
        marginBottom: 8,
        letterSpacing: 1,
        textShadowColor: 'rgba(0, 0, 0, 0.4)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10
    },
    tagline: {
        fontSize: 18,
        color: "rgba(255,255,255,0.9)",
        textAlign: 'center',
        marginBottom: 24,
        fontWeight: '500',
        textShadowColor: 'rgba(0, 0, 0, 0.2)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3
    },
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
    modeSelector: {
        marginBottom: 16,
    },
    segmentedButtons: {
        marginBottom: 4,
    },
    offlineNotice: {
        marginTop: 8,
        marginBottom: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
    },
    createBtn: { marginTop: 20, marginBottom: 8, borderRadius: 12, paddingVertical: 4, backgroundColor: '#3949ab' },
    input: { marginBottom: 4, backgroundColor: '#fff' }
});
